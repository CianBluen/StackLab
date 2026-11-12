import type {
  AddressRef,
  CodeGroup,
  EffectKind,
  ExecutionContext,
  FrameTone,
  Instruction,
  MemoryType,
  RegisterName,
  SimulatorState,
  StepEffect,
} from './types'
import {
  activeFrame,
  allocateStack,
  callFunction,
  clone,
  establishFrame,
  executeRet,
  popRegister,
  pushEbp,
  pushRegister,
  pushValue,
  readMemory,
  releaseStackRange,
  releaseToEbp,
  restoreEbp,
  terminateProcess,
  writeCell,
  writeLocal,
} from './ops'
import { hex, stampSource } from './utils'

export type StepOp =  | { type: 'push-ebp' }
  | { type: 'mov-ebp-esp' }
  | { type: 'pop-ebp' }
  | { type: 'ret' }
  | {
      type: 'push-imm'
      value: number
      argument?: string
      label?: string
      variable?: string
      display?: string
    }
  | {
      type: 'push-reg'
      register: RegisterName
      label?: string
      saveAsCallee?: boolean
    }
  | { type: 'push-mem'; base: 'ebp' | 'esp'; offset: number; label?: string }
  | { type: 'pop-reg'; register: RegisterName }
  | {
      type: 'call'
      targetFunctionId: string
      argsBytes: number
      label?: string
    }
  | { type: 'mov-reg-imm'; register: RegisterName; value: number; display?: string }
  | { type: 'mov-reg-reg'; dest: RegisterName; source: RegisterName }
  | {
      type: 'mov-reg-mem'
      register: RegisterName
      base: 'ebp' | 'esp'
      offset: number
      variable?: string
    }
  | {
      type: 'mov-mem-imm'
      offset: number
      value: number
      variable: string
      memoryType?: MemoryType
    }
  | {
      type: 'mov-mem-reg'
      offset: number
      register: RegisterName
      variable?: string
    }
  | {
      type: 'add-reg-mem'
      register: RegisterName
      base: 'ebp' | 'esp'
      offset: number
      variable?: string
    }
  | {
      type: 'lea-reg-mem'
      register: RegisterName
      base: 'ebp' | 'esp'
      offset: number
      variable?: string
    }
  | { type: 'add-reg-reg'; dest: RegisterName; source: RegisterName }
  | {
      type: 'sub-esp'
      bytes: number
      purpose?: 'locals' | 'alignment'
      label?: string
      effectLabel?: string
    }
  | { type: 'add-esp'; bytes: number; label?: string }
  | { type: 'mov-esp-ebp' }
  | { type: 'xor-reg-reg'; register: RegisterName }
  | { type: 'int'; code: number }
  | {
      type: 'os-init-stack'
      writes: {
        address: number
        value: number
        type: MemoryType
        label: string
      }[]
      label?: string
    }
  | { type: 'nop'; note?: string }

export interface StepSpec {
  id: string
  op: StepOp
  cLine?: number | null
  title?: string
  explanation?: string
  reason?: string
  phase?: string
  assembly?: string
}

export interface FunctionSpec {
  id: string
  name: string
  signature: string
  tone: FrameTone
  baseAddress: number
  sourceFunctionId?: string | null
  usesFramePointer?: boolean
  /** 内核装载这类非 x86 代码分组：UI 会标注“系统动作”。 */
  isSystem?: boolean
  steps: StepSpec[]
}

interface BuiltFunction {
  spec: FunctionSpec
  instructions: Instruction[]
  entryAddress: number
}

export interface BuiltProgram {
  functions: BuiltFunction[]
  codeGroups: CodeGroup[]
  instructionMap: Map<string, Instruction>
  functionMap: Map<string, FunctionSpec & { entryAddress: number }>
}

const U = (value: number): string => value.toString(16).toUpperCase()

const immediate = (value: number, display?: string): string => {
  if (display) return display
  if (value > 255 || value < -128) return `0x${U(value)}`
  return String(value)
}

const memOperand = (base: 'ebp' | 'esp', offset: number): string => {
  if (offset === 0) return `[${base}]`
  return `[${base}${offset > 0 ? '+' : ''}${offset}]`
}

const assemblyFor = (op: StepOp, target?: FunctionSpec): string => {
  switch (op.type) {
    case 'push-ebp':
      return 'push ebp'
    case 'mov-ebp-esp':
      return 'mov ebp, esp'
    case 'pop-ebp':
      return 'pop ebp'
    case 'ret':
      return 'ret'
    case 'push-imm':
      return `push ${immediate(op.value, op.display)}`
    case 'push-reg':
      return `push ${op.register}`
    case 'push-mem':
      return `push dword ptr ${memOperand(op.base, op.offset)}`
    case 'pop-reg':
      return `pop ${op.register}`
    case 'call':
      return `call ${target?.name ?? op.targetFunctionId}`
    case 'mov-reg-imm':
      return `mov ${op.register}, ${immediate(op.value, op.display)}`
    case 'mov-reg-reg':
      return `mov ${op.dest}, ${op.source}`
    case 'mov-reg-mem':
      return `mov ${op.register}, dword ptr ${memOperand(op.base, op.offset)}`
    case 'mov-mem-imm':
      return `mov dword ptr ${memOperand('ebp', op.offset)}, ${immediate(op.value)}`
    case 'mov-mem-reg':
      return `mov dword ptr ${memOperand('ebp', op.offset)}, ${op.register}`
    case 'add-reg-mem':
      return `add ${op.register}, dword ptr ${memOperand(op.base, op.offset)}`
    case 'lea-reg-mem':
      return `lea ${op.register}, ${memOperand(op.base, op.offset)}`
    case 'add-reg-reg':
      return `add ${op.dest}, ${op.source}`
    case 'sub-esp':
      return `sub esp, ${op.bytes}`
    case 'add-esp':
      return `add esp, ${op.bytes}`
    case 'mov-esp-ebp':
      return 'mov esp, ebp'
    case 'xor-reg-reg':
      return `xor ${op.register}, ${op.register}`
    case 'int':
      return `int 0x${U(op.code)}`
    case 'os-init-stack':
      return 'kernel: setup_initial_stack'
    case 'nop':
      return 'nop'
  }
}

const estimateSize = (assembly: string): number => {
  const asm = assembly.trim()
  if (asm.startsWith('kernel:')) return 0
  if (asm === 'ret' || asm === 'nop') return 1
  if (asm.startsWith('pop ')) return 1
  if (asm.startsWith('push ') && !asm.startsWith('push dword ptr')) {
    if (/^\w+$/.test(asm.slice(5))) return 1
    return asm.length <= 7 ? 2 : 5
  }
  if (asm.startsWith('push dword ptr')) return 3
  if (asm.startsWith('call ')) return 5
  if (asm.startsWith('int ')) return 2
  if (asm.startsWith('xor ')) return 2
  if (asm.startsWith('lea ')) return 3
  if (/^mov (ebp, esp|esp, ebp)/.test(asm)) return 2
  if (asm.startsWith('mov dword ptr')) {
    return /, 10$|, 20$|, 30$|, 40$/.test(asm) ? 7 : 3
  }
  if (asm.startsWith('mov ') && asm.includes('dword ptr')) return 3
  if (asm.startsWith('mov ') && asm.includes(',')) return 5
  if (asm.startsWith('add ') && asm.includes('dword ptr')) return 3
  if (asm.startsWith('add ')) return 2
  if (asm.startsWith('sub esp,')) return 3
  if (asm.startsWith('and esp,')) return 3
  return 3
}

const addressingFor = (op: StepOp): AddressRef | null => {
  switch (op.type) {
    case 'mov-reg-mem':
    case 'add-reg-mem':
    case 'push-mem':
      return { base: op.base, offset: op.offset, kind: 'read' }
    case 'mov-mem-imm':
    case 'mov-mem-reg':
      return { base: 'ebp', offset: op.offset, kind: 'write' }
    case 'lea-reg-mem':
      return { base: op.base, offset: op.offset, kind: 'lea' }
    default:
      return null
  }
}

const createEffect = (
  kind: StepEffect['kind'],
  addresses: number[],
  label: string,
  extra: Partial<StepEffect> = {},
): StepEffect => ({ kind, addresses, label, ...extra })

interface InstructionBuildContext {
  step: StepSpec
  functionSpec: FunctionSpec
  address: number
  nextAddress: number
  program: Map<string, FunctionSpec & { entryAddress: number }>
}

const descriptionFor = ({
  step,
  functionSpec,
  nextAddress,
  program,
}: InstructionBuildContext): Pick<Instruction, 'title' | 'explanation' | 'reason'> => {
  const { op } = step
  const target =
    op.type === 'call' ? program.get(op.targetFunctionId) : undefined
  const offsetText = (offset: number) => memOperand('ebp', offset)
  let title = '执行指令'
  let explanation = '执行当前 x86 指令，并同步更新模拟器状态。'
  let reason = '该指令会真实修改寄存器或栈内存，动画只展示状态变化的结果。'

  switch (op.type) {
    case 'push-ebp':
      title = `保存 ${functionSpec.name} 调用者的 EBP`
      explanation =
        '序言先保存调用者的 EBP。这个值会在函数返回时由 pop ebp 恢复，从而重新找回调用者的栈帧。'
      reason =
        'push 先把 ESP 减 4，再把当前 EBP 写入新的栈顶。因此 ESP 从 {espB} 变成 {espA}，EBP 暂时保持 {ebpB} 不变；旧 EBP 保存在 {espA}。'
      break
    case 'mov-ebp-esp':
      title = `建立 ${functionSpec.name} 的栈帧基准`
      explanation =
        '把 ESP 复制给 EBP，让 EBP 成为当前函数访问参数和局部变量的基准。'
      reason =
        'mov 只修改 EBP。EBP 从 {ebpB} 移动到 {ebpA}，与 ESP = {espA} 重合；ESP 本身不变。此时新栈帧的边界由 EBP 和不断变化的 ESP 共同确定。'
      break
    case 'pop-ebp':
      title = '恢复调用者的 EBP'
      explanation =
        '从栈顶取出序言阶段保存的旧 EBP，写回 EBP 寄存器，再把 ESP 上移 4 字节。'
      reason =
        'pop 先把 [{espB}] 中的旧 EBP 恢复到 EBP，使 EBP 变为 {ebpA}，然后让 ESP 增加到 {espA}。函数即将通过 ret 返回调用者。'
      break
    case 'ret':
      title = '弹出返回地址并返回'
      explanation =
        '从栈顶取出 CALL 压入的返回地址，写入 EIP，让 CPU 回到调用点之后继续执行。'
      reason =
        'ret 读取 [{espB}] 中的返回地址并写入 EIP，随后 ESP 从 {espB} 增加到 {espA}。当前函数帧被标记为历史帧，旧数据保留在内存中但不再有效。'
      break
    case 'push-imm': {
      const targetLabel = op.argument
        ? `参数 ${op.argument} = ${op.value}`
        : op.label ?? `立即数 ${op.value}`
      title = op.argument
        ? `压入实参 ${op.argument} = ${op.value}`
        : `压入立即数 ${op.value}`
      explanation = op.argument
        ? `把参数 ${op.argument} 压入栈顶，作为即将调用的函数的实参。cdecl 由调用者负责在返回后清理参数。`
        : `把数值 ${op.value} 压入栈顶。push 会先减小 ESP，再写入数据。`
      reason = `push 等价于 ESP = ESP − 4，然后写入 ${op.value}。ESP 从 {espB} 变成 {espA}，EBP 保持 {ebpB}；新单元位于 {espA}（${targetLabel}）。`
      break
    }
    case 'push-reg':
      title = `保存 callee-saved 寄存器 ${op.register.toUpperCase()}`
      explanation =
        '当前函数会修改这个 callee-saved 寄存器，因此必须先把它压入栈保存。返回前会用对应的 pop 恢复原值。'
      reason = `EBX / ESI / EDI 在 32-bit cdecl 中通常由被调用者保存。push ${op.register} 先把 ESP 减 4，再把 ${op.register.toUpperCase()} 的当前值写入 {espA}；ESP 从 {espB} 变为 {espA}。`
      break
    case 'push-mem':
      title = '从栈帧中读取参数并压栈'
      explanation =
        '把调用者栈帧中的值读出并压入栈顶，用于构造下一次函数调用或运行时启动参数。'
      reason = `指令读取 ${memOperand(op.base, op.offset)} 的内容，然后执行 push。ESP 从 {espB} 变为 {espA}，EBP 不变。`
      break
    case 'pop-reg':
      title = `恢复 callee-saved 寄存器 ${op.register.toUpperCase()}`
      explanation =
        '从栈顶弹出保存的寄存器值，恢复到原来的寄存器，保证调用者看到的 EBX / ESI / EDI 与调用前一致。'
      reason = `pop ${op.register} 先读取 [{espB}]，把值写回 ${op.register.toUpperCase()}，再将 ESP 增加到 {espA}。恢复顺序必须与保存顺序相反。`
      break
    case 'call':
      title = `调用 ${target?.name ?? op.targetFunctionId}`
      explanation = `CALL 先把下一条指令的地址压入栈，然后跳转到 ${target?.name ?? op.targetFunctionId} 的入口。返回地址让函数结束后还能继续执行调用者。`
      reason = `CALL 将返回地址 0x${U(nextAddress)} 压入栈，ESP 变为 {espA}；随后 EIP 跳到 ${target?.name ?? op.targetFunctionId} 的入口。新函数的栈帧此时开始建立，参数从调用者的传出参数区转交给被调用者。`
      break
    case 'mov-reg-imm':
      title = `把立即数写入 ${op.register.toUpperCase()}`
      explanation = `mov 将常量 ${op.value} 写入 ${op.register.toUpperCase()} 寄存器，不访问栈内存。`
      reason = `${op.register.toUpperCase()} 从 {${op.register}B} 变为 {${op.register}A}；ESP 与 EBP 均不变。`
      break
    case 'mov-reg-reg':
      title = `${op.dest.toUpperCase()} ← ${op.source.toUpperCase()}`
      explanation = `把 ${op.source.toUpperCase()} 的内容复制到 ${op.dest.toUpperCase()}。这只是寄存器之间的数据移动。`
      reason = `${op.dest.toUpperCase()} 从 {${op.dest}B} 变为 {${op.dest}A}；${op.source.toUpperCase()} 与栈指针保持不变。`
      break
    case 'mov-reg-mem': {
      const variable = op.variable ? `局部变量 ${op.variable}` : '内存值'
      title = `从 ${offsetText(op.offset)} 读取${variable}`
      explanation = `通过 EBP 相对寻址读取${variable}，把结果写入 ${op.register.toUpperCase()}。`
      reason = `目标地址 = EBP + (${op.offset})。指令读取该单元后将值写入 ${op.register.toUpperCase()}，因此 ${op.register.toUpperCase()} 从 {${op.register}B} 变为 {${op.register}A}；ESP、EBP 不变。`
      break
    }
    case 'mov-mem-imm':
      title = `写入局部变量 ${op.variable} = ${op.value}`
      explanation = `把 ${op.value} 写入 [EBP ${op.offset}] 对应的局部变量槽，也就是变量 ${op.variable}。`
      reason = `目标地址 = EBP ${op.offset >= 0 ? '+' : ''}${op.offset}。指令只修改该内存单元，因此 ESP 保持 {espA}、EBP 保持 {ebpA} 不变。局部变量 ${op.variable} 从调试填充/未初始化状态变成有效值 ${op.value}。`
      break
    case 'mov-mem-reg':
      title = `把 ${op.register.toUpperCase()} 写回局部变量`
      explanation = `把 ${op.register.toUpperCase()} 的值写入 [EBP ${op.offset}] 对应的内存槽。`
      reason = `这条 mov 把寄存器内容写回栈内存。目标地址由 EBP + (${op.offset}) 计算，ESP 与 EBP 都不发生变化。`
      break
    case 'add-reg-mem':
      title = `把 ${op.variable ?? '内存值'} 累加到 ${op.register.toUpperCase()}`
      explanation = `读取 [EBP ${op.offset}] 中的值，与 ${op.register.toUpperCase()} 相加，结果写回 ${op.register.toUpperCase()}。`
      reason = `${op.register.toUpperCase()} 从 {${op.register}B} 变为 {${op.register}A}。这是寄存器运算，栈内存和 ESP / EBP 不会被修改。`
      break
    case 'lea-reg-mem':
      title = op.variable
        ? `计算 ${op.variable} 的地址并写入 ${op.register.toUpperCase()}`
        : `计算有效地址并写入 ${op.register.toUpperCase()}`
      explanation = `lea 只做地址运算，不读取内存内容。它把 ${offsetText(op.offset)} 的计算结果放进 ${op.register.toUpperCase()}，常用于取得局部变量的指针。`
      reason = `有效地址 = EBP + (${op.offset})。${op.register.toUpperCase()} 从 {${op.register}B} 变为 {${op.register}A}；被指向的栈单元内容保持不变，ESP 也不变。`
      break
    case 'add-reg-reg':
      title = `${op.dest.toUpperCase()} += ${op.source.toUpperCase()}`
      explanation = `把 ${op.source.toUpperCase()} 的值加到 ${op.dest.toUpperCase()}，结果保存在 ${op.dest.toUpperCase()}。`
      reason = `${op.dest.toUpperCase()} 从 {${op.dest}B} 变为 {${op.dest}A}；栈指针与栈内存不变。`
      break
    case 'sub-esp':
      title = `为栈帧预留 ${op.bytes} 字节`
      explanation = `sub esp, ${op.bytes} 只是在逻辑上把栈顶向低地址移动 ${op.bytes} 字节，并不会由 CPU 自动清零这块空间。若开启 Debug Stack Fill，模拟器会显示 0xCCCCCCCC 填充。`
      reason = `SUB 从 ESP 中减去 ${op.bytes}，ESP 从 {espB} 变为 {espA}，EBP 保持 {ebpA}。新出现的槽位处于“已预留、未初始化”状态；只有被 mov 真正写入后，才成为有效变量。`
      break
    case 'add-esp':
      title = `回收 ${op.bytes} 字节栈空间`
      explanation =
        '把 ESP 向高地址移动，释放当前函数不再需要的局部变量或参数空间。释放不会清零内容，旧值会作为残留数据保留，直到被下一次 push/mov 覆盖。'
      reason = `ADD 使 ESP 从 {espB} 增加到 {espA}，EBP 不变。被跨越的内存单元不再是有效栈帧的一部分，但值仍可能留在内存中。`
      break
    case 'mov-esp-ebp':
      title = '把 ESP 拉回 EBP，释放局部变量区'
      explanation =
        '直接把 ESP 设为 EBP，可以一次性丢弃 EBP 下方的局部变量空间。内容不会被自动擦除。'
      reason = `ESP 从 {espB} 上移到 {ebpA}，EBP 不变。原先的局部变量单元被标记为已释放，数据作为历史残留保留。`
      break
    case 'xor-reg-reg':
      title = `清零 ${op.register.toUpperCase()}`
      explanation = `xor ${op.register}, ${op.register} 是常见的清零方式，结果为 0 且通常比 mov 立即数更短。`
      reason = `${op.register.toUpperCase()} 被清零为 0；ESP、EBP 和栈内存不受影响。`
      break
    case 'int':
      title = '触发 Linux 32-bit 系统调用'
      explanation = `int 0x80 进入内核。EAX 中的系统调用号决定操作；本案例使用 exit，EBX 提供退出码。`
      reason = `系统调用不会修改用户栈。程序退出后，所有栈帧都只保留为历史快照；这不是 CPU 自动清零内存。`
      break
    case 'os-init-stack':
      title = op.label ?? '操作系统建立初始用户栈'
      explanation =
        '这是内核/装载器的动作，不是 CPU 执行的 x86 指令。程序开始运行前，内核已经把 argc、argv、envp、auxv 等启动信息写入新进程的用户栈，并把程序入口地址设为 _start。'
      reason =
        '此刻还没有 main 栈帧，也没有 main 的返回地址。栈顶位于 {espA}；下面这些单元属于“进程初始栈”，不是任何 C 函数的局部变量。'
      break
    case 'nop':
      title = '空操作'
      explanation = 'CPU 不改变任何寄存器或内存。'
      reason = '没有状态变化。'
      break
  }

  return {
    title: step.title ?? title,
    explanation: step.explanation ?? explanation,
    reason: step.reason ?? reason,
  }
}

const WRITE_EFFECTS: ReadonlySet<EffectKind> = new Set<EffectKind>([
  'push',
  'call',
  'write',
  'fill',
  'allocate',
  'save-register',
  'os',
])

const executeOp = (
  state: SimulatorState,
  op: StepOp,
  context: ExecutionContext,
  nextAddress: number,
  target?: FunctionSpec,
  assembly = '',
): SimulatorState => {  const s = clone(state)
  switch (op.type) {
    case 'push-ebp': {
      pushEbp(s)
      break
    }
    case 'mov-ebp-esp': {
      establishFrame(s)
      break
    }
    case 'pop-ebp': {
      restoreEbp(s)
      break
    }
    case 'ret': {
      executeRet(s)
      break
    }
    case 'push-imm': {
      const frame = activeFrame(s)
      const address = pushValue(s, op.value, {
        type: 'parameter',
        label: op.argument ? `参数 ${op.argument}` : op.label ?? '立即数',
        frameId: frame?.id ?? null,
        variable: op.variable ?? op.argument ?? null,
      })
      s.lastEffect = createEffect('push', [address], op.label ?? `${op.value}`, {
        value: op.value,
      })
      break
    }
    case 'push-reg': {
      const frame = activeFrame(s)
      if (frame && op.saveAsCallee !== false) {
        pushRegister(s, op.register, frame.id, op.label)
      } else {
        const address = pushValue(s, s[op.register], {
          type: 'parameter',
          label: op.label ?? `压入 ${op.register.toUpperCase()}`,
          frameId: frame?.id ?? null,
        })
        s.lastEffect = {
          kind: 'push',
          addresses: [address],
          value: s[op.register],
          register: op.register,
          label: op.label ?? `${op.register.toUpperCase()} → 栈`,
        }
      }
      break
    }
    case 'push-mem': {
      const memory = readMemory(s, op.base, op.offset)
      const frame = activeFrame(s)
      const address = pushValue(s, memory.value, {
        type: 'parameter',
        label: op.label ?? `[${op.base}${op.offset >= 0 ? '+' : ''}${op.offset}] 的值`,
        frameId: frame?.id ?? null,
      })
      s.lastEffect = createEffect('push', [address], `PUSH ${op.label ?? memory.value}`, {
        value: memory.value,
      })
      break
    }
    case 'pop-reg': {
      popRegister(s, op.register)
      break
    }
    case 'call': {
      if (!target) throw new Error(`未知函数 ${op.targetFunctionId}`)
      callFunction(s, {
        functionId: target.id,
        name: target.name,
        signature: target.signature,
        tone: target.tone,
        returnAddress: nextAddress,
        returnTo: hex(nextAddress),
        argsBytes: op.argsBytes,
        usesFramePointer: target.usesFramePointer,
      })
      break
    }
    case 'mov-reg-imm': {
      const from = s[op.register]
      s[op.register] = op.value
      s.lastEffect = createEffect('register', [], `${op.register.toUpperCase()} ← ${op.value}`, {
        register: op.register,
        from,
        to: op.value,
      })
      break
    }
    case 'mov-reg-reg': {
      const from = s[op.dest]
      s[op.dest] = s[op.source]
      s.lastEffect = createEffect('register', [], `${op.dest.toUpperCase()} ← ${op.source.toUpperCase()}`, {
        register: op.dest,
        from,
        to: s[op.dest],
      })
      break
    }
    case 'mov-reg-mem': {
      const memory = readMemory(s, op.base, op.offset)
      const from = s[op.register]
      s[op.register] = memory.value
      s.lastEffect = createEffect('compute', [memory.address], `${op.register.toUpperCase()} ← ${memory.value}`, {
        register: op.register,
        from,
        to: memory.value,
      })
      break
    }
    case 'mov-mem-imm': {
      writeLocal(s, op.offset, op.value, op.variable)
      break
    }
    case 'mov-mem-reg': {
      const address = s.ebp + op.offset
      const frame = activeFrame(s)
      writeCell(s, address, {
        value: s[op.register],
        type: 'local',
        label: op.variable ? `${op.variable} = ${s[op.register]}` : '内存写入',
        frameId: frame?.id ?? null,
        variable: op.variable ?? null,
        isAllocated: true,
        isInitialized: true,
        fillKind: null,
      })
      s.lastEffect = createEffect('write', [address], `${op.register.toUpperCase()} → 内存`, {
        value: s[op.register],
        register: op.register,
      })
      break
    }
    case 'add-reg-mem': {
      const memory = readMemory(s, op.base, op.offset)
      const from = s[op.register]
      s[op.register] += memory.value
      s.lastEffect = createEffect('compute', [memory.address], `${op.register.toUpperCase()} += ${memory.value}`, {
        register: op.register,
        from,
        to: s[op.register],
      })
      break
    }
    case 'lea-reg-mem': {
      const address = (op.base === 'ebp' ? s.ebp : s.esp) + op.offset
      const from = s[op.register]
      s[op.register] = address
      s.lastEffect = createEffect(
        'lea',
        [address],
        `${op.register.toUpperCase()} ← &${op.variable ?? 'mem'}`,
        { register: op.register, from, to: address },
      )
      break
    }
    case 'add-reg-reg': {
      const from = s[op.dest]
      s[op.dest] += s[op.source]
      s.lastEffect = createEffect('compute', [], `${op.dest.toUpperCase()} += ${op.source.toUpperCase()}`, {
        register: op.dest,
        from,
        to: s[op.dest],
      })
      break
    }
    case 'sub-esp': {
      allocateStack(s, op.bytes, {
        context,
        purpose: op.purpose ?? 'locals',
        label: op.label ?? '局部变量空间',
        effectLabel: op.effectLabel ?? `预留 ${op.bytes} B`,
      })
      break
    }
    case 'add-esp': {
      releaseStackRange(s, op.bytes, op.label ?? `回收 ${op.bytes} B`)
      break
    }
    case 'mov-esp-ebp': {
      releaseToEbp(s)
      break
    }
    case 'xor-reg-reg': {
      const from = s[op.register]
      s[op.register] = 0
      s.lastEffect = createEffect('register', [], `${op.register.toUpperCase()} ← 0`, {
        register: op.register,
        from,
        to: 0,
      })
      break
    }
    case 'int': {
      terminateProcess(s, s.ebx & 0xff)
      break
    }
    case 'os-init-stack': {
      // 初始栈数据属于“进程初始栈”区域，不属于当前活动的 _start 帧。
      const frame =
        s.callStack.find((candidate) => candidate.functionId === 'kernel') ??
        activeFrame(s)
      for (const write of op.writes) {
        writeCell(s, write.address, {
          value: write.value,
          type: write.type,
          label: write.label,
          frameId: frame?.id ?? null,
          isAllocated: true,
          isInitialized: true,
        })
      }
      s.lastEffect = createEffect(
        'os',
        op.writes.map((write) => write.address),
        op.label ?? '内核建立初始栈',
      )
      break
    }
    case 'nop':
      break
  }

  const effect = s.lastEffect
  if (effect && effect.addresses.length > 0 && WRITE_EFFECTS.has(effect.kind)) {
    stampSource(s, effect.addresses, assembly)
  }

  return s
}

export const buildProgram = (specs: FunctionSpec[]): BuiltProgram => {
  const functionMap = new Map<string, FunctionSpec & { entryAddress: number }>()
  for (const spec of specs) {
    functionMap.set(spec.id, { ...spec, entryAddress: spec.baseAddress })
  }

  const addressRecords = new Map<
    string,
    { address: number; nextAddress: number; assembly: string }
  >()

  for (const spec of specs) {
    let cursor = spec.baseAddress
    for (const step of spec.steps) {
      const target =
        step.op.type === 'call' ? functionMap.get(step.op.targetFunctionId) : undefined
      const assembly = step.assembly ?? assemblyFor(step.op, target)
      const size = estimateSize(assembly)
      addressRecords.set(step.id, {
        address: cursor,
        nextAddress: cursor + size,
        assembly,
      })
      cursor += size
    }
  }

  const functions: BuiltFunction[] = specs.map((spec) => {
    const instructions = spec.steps.map((step) => {
      const record = addressRecords.get(step.id)
      if (!record) throw new Error(`Missing address for ${step.id}`)
      const target =
        step.op.type === 'call' ? functionMap.get(step.op.targetFunctionId) : undefined
      const ctx: InstructionBuildContext = {
        step,
        functionSpec: spec,
        address: record.address,
        nextAddress: record.nextAddress,
        program: functionMap,
      }
      const copy = descriptionFor(ctx)
      return {
        id: step.id,
        address: record.address,
        functionId: spec.id,
        functionName: spec.name,
        cLine: step.cLine ?? null,
        assembly: record.assembly,
        title: copy.title,
        explanation: copy.explanation,
        reason: copy.reason,
        phase: step.phase,
        addressing: addressingFor(step.op),
        isSystemAction: step.op.type === 'os-init-stack',
        isPrologue: step.op.type === 'push-ebp' || step.op.type === 'mov-ebp-esp',
        execute: (state: SimulatorState, context: ExecutionContext) =>
          executeOp(state, step.op, context, record.nextAddress, target, record.assembly),
      } satisfies Instruction
    })

    return {
      spec,
      instructions,
      entryAddress: spec.baseAddress,
    }
  })

  const instructionMap = new Map<string, Instruction>()
  for (const fn of functions) {
    for (const instruction of fn.instructions) {
      instructionMap.set(instruction.id, instruction)
    }
  }

  const codeGroups: CodeGroup[] = functions.map((fn) => ({
    id: fn.spec.id,
    name: fn.spec.name,
    signature: fn.spec.signature,
    tone: fn.spec.tone,
    baseAddress: fn.entryAddress,
    instructions: fn.instructions,
  }))

  return { functions, codeGroups, instructionMap, functionMap }
}

export const selectExecutionOrder = (
  program: BuiltProgram,
  ids: string[],
): Instruction[] => {
  return ids.map((id) => {
    const instruction = program.instructionMap.get(id)
    if (!instruction) throw new Error(`未知指令 ${id}`)
    return instruction
  })
}

export const effectIsWrite = (effect: StepEffect | null): boolean =>
  effect?.kind === 'write' || effect?.kind === 'fill'

export const findFrameByFunction = (
  state: SimulatorState,
  functionId: string,
) => activeFrame(state)?.functionId === functionId
  ? activeFrame(state)
  : state.callStack.find((frame) => frame.functionId === functionId)
