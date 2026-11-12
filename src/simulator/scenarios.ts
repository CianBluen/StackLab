import {
  buildProgram,
  selectExecutionOrder,
  type FunctionSpec,
} from './assembler'
import { createInitialState, setupFrame, type CellSeed } from './ops'
import type {
  CSourceFunction,
  Scenario,
  ScenarioPhase,
  SimulatorState,
} from './types'

const MAIN_RETURN = 0x004018f0
const CALLER_EBP = 0x00001018
const STACK_TOP = 0x1010
const STACK_BOTTOM = 0x0f60

const defaultRegisters = {
  eax: 0,
  ebx: 0x7ffde000,
  ecx: 0x00402000,
  edx: 0x00401000,
  esi: 0x00402010,
  edi: 0x00402020,
}

const makeSource = (
  text: string,
  functions: CSourceFunction[],
): Scenario['cSource'] => {
  const raw = text.split('\n')
  return {
    functions,
    lines: raw.map((line, index) => {
      const number = index + 1
      const owner = functions.find(
        (fn) => number >= fn.startLine && number <= fn.endLine,
      )
      return {
        number,
        text: line,
        functionId: owner?.id ?? null,
      }
    }),
  }
}

const createEstablishedMain = ({
  eip,
  registers = defaultRegisters,
  extraCells = [],
  stackTop = STACK_TOP,
  stackBottom = STACK_BOTTOM,
}: {
  eip: number
  registers?: Partial<Record<keyof SimulatorState['registers'], number>>
  extraCells?: CellSeed[]
  stackTop?: number
  stackBottom?: number
}): SimulatorState => {
  const frame = setupFrame({
    id: 'main@initial',
    functionId: 'main',
    name: 'main',
    signature: 'main()',
    tone: 'blue',
    entryESP: 0x1000,
    currentESP: 0x1000,
    entryEBP: 0x1000,
    frameBase: 0x1000,
    returnAddress: MAIN_RETURN,
    returnTo: '运行时启动代码',
    status: 'active',
  })

  return createInitialState({
    stackTop,
    stackBottom,
    esp: 0x1000,
    ebp: 0x1000,
    eip,
    registers,
    frames: [frame],
    cells: [
      {
        address: 0x1004,
        value: MAIN_RETURN,
        type: 'return',
        label: 'main 返回地址',
        frameId: frame.id,
        sourceInstruction: 'call main（案例起点之前）',
      },
      {
        address: 0x1000,
        value: CALLER_EBP,
        type: 'saved-ebp',
        label: 'main 保存的旧 EBP',
        frameId: frame.id,
        sourceInstruction: 'push ebp（案例起点之前）',
      },
      ...extraCells,
    ],
  })
}

/**
 * 「main 刚被运行时 CALL 进来」的起点：栈顶只有返回地址，序言还没执行。
 * 用于只想讲 main 自己的栈帧与局部变量、又不想重跑整条启动链的案例。
 */
const createMainAtEntry = ({
  eip,
  signature = 'main()',
  stackTop = STACK_TOP,
  stackBottom = STACK_BOTTOM,
  registers = defaultRegisters,
}: {
  eip: number
  signature?: string
  stackTop?: number
  stackBottom?: number
  registers?: Partial<Record<keyof SimulatorState['registers'], number>>
}): SimulatorState => {
  const frame = setupFrame({
    id: 'main@entry',
    functionId: 'main',
    name: 'main',
    signature,
    tone: 'blue',
    entryESP: 0x1000,
    currentESP: 0x1000,
    entryEBP: CALLER_EBP,
    returnAddress: MAIN_RETURN,
    returnTo: '运行时启动代码',
    status: 'creating',
  })

  return createInitialState({
    stackTop,
    stackBottom,
    esp: 0x1000,
    ebp: CALLER_EBP,
    eip,
    registers,
    frames: [frame],
    cells: [
      {
        address: 0x1000,
        value: MAIN_RETURN,
        type: 'return',
        label: 'main 返回地址',
        frameId: frame.id,
        sourceInstruction: 'call main（案例起点之前）',
      },
    ],
  })
}

const teachingProfile = (note: string) => ({  kind: 'teaching' as const,
  compiler: '手写教学汇编',
  options: '非编译器实时输出',
  abi: 'x86-32 · cdecl',
  verified: false,
  note,
})

// ---------------------------------------------------------------------------
// 案例 1：最简单的函数调用
// ---------------------------------------------------------------------------

const basicCallScenario = (): Scenario => {
  const mainSpec: FunctionSpec = {
    id: 'main',
    name: 'main',
    signature: 'main()',
    tone: 'blue',
    baseAddress: 0x00401000,
    sourceFunctionId: 'main',
    steps: [
      {
        id: 'basic-main-push-b',
        cLine: 8,
        op: { type: 'push-imm', value: 20, argument: 'b' },
      },
      {
        id: 'basic-main-push-a',
        cLine: 8,
        op: { type: 'push-imm', value: 10, argument: 'a' },
      },
      {
        id: 'basic-main-call',
        cLine: 8,
        op: { type: 'call', targetFunctionId: 'add', argsBytes: 8 },
      },
      {
        id: 'basic-main-cleanup',
        cLine: 8,
        op: { type: 'add-esp', bytes: 8, label: '调用者清理两个参数' },
      },
      {
        id: 'basic-main-pop-ebp',
        cLine: 9,
        op: { type: 'pop-ebp' },
      },
      {
        id: 'basic-main-ret',
        cLine: 9,
        op: { type: 'ret' },
      },
    ],
  }

  const addSpec: FunctionSpec = {
    id: 'add',
    name: 'add',
    signature: 'add(a, b)',
    tone: 'green',
    baseAddress: 0x00401040,
    sourceFunctionId: 'add',
    steps: [
      { id: 'basic-add-push-ebp', cLine: 1, op: { type: 'push-ebp' } },
      { id: 'basic-add-mov-ebp', cLine: 2, op: { type: 'mov-ebp-esp' } },
      {
        id: 'basic-add-load-a',
        cLine: 3,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: 8, variable: 'a' },
      },
      {
        id: 'basic-add-b',
        cLine: 3,
        op: { type: 'add-reg-mem', register: 'eax', base: 'ebp', offset: 12, variable: 'b' },
      },
      { id: 'basic-add-pop-ebp', cLine: 4, op: { type: 'pop-ebp' } },
      { id: 'basic-add-ret', cLine: 4, op: { type: 'ret' } },
    ],
  }

  const program = buildProgram([mainSpec, addSpec])
  const execution = selectExecutionOrder(program, [
    'basic-main-push-b',
    'basic-main-push-a',
    'basic-main-call',
    'basic-add-push-ebp',
    'basic-add-mov-ebp',
    'basic-add-load-a',
    'basic-add-b',
    'basic-add-pop-ebp',
    'basic-add-ret',
    'basic-main-cleanup',
    'basic-main-pop-ebp',
    'basic-main-ret',
  ])

  return {
    id: 'basic-call',
    title: '最简单的函数调用',
    shortTitle: '基础调用',
    subtitle: 'CALL / RET / 参数入栈',
    description:
      '从 main 调用 add(10, 20) 开始，观察参数、返回地址、新版 EBP 与 EAX 返回值如何依次进入和离开栈。',
    level: '入门',
    tags: ['CALL', 'RET', 'cdecl', '参数'],
    learningPoints: [
      'CALL 自动把下一条指令地址压栈',
      'RET 从栈顶取回返回地址并写入 EIP',
      'cdecl 由调用者清理参数',
    ],
    compiler: teachingProfile(
      '这是为教学展开的手写汇编，不是 GCC / Clang 的实时输出。main 的序言已完成，案例关注 CALL/RET。',
    ),
    cSource: makeSource(
      [
        'int add(int a, int b)',
        '{',
        '    return a + b;',
        '}',
        '',
        'int main()',
        '{',
        '    return add(10, 20);',
        '}',
      ].join('\n'),
      [
        { id: 'add', name: 'add', signature: 'add(int a, int b)', startLine: 1, endLine: 4 },
        { id: 'main', name: 'main', signature: 'main()', startLine: 6, endLine: 9 },
      ],
    ),
    variables: [
      {
        name: 'a',
        functionId: 'add',
        line: 1,
        typeLabel: 'int',
        storage: 'stack',
        offset: 8,
      },
      {
        name: 'b',
        functionId: 'add',
        line: 1,
        typeLabel: 'int',
        storage: 'stack',
        offset: 12,
      },
    ],
    codeGroups: program.codeGroups,
    instructions: execution,
    stackTop: STACK_TOP,
    stackBottom: STACK_BOTTOM,
    initialState: () =>
      createEstablishedMain({
        eip: execution[0].address,
      }),
    resultLabel: 'add() 返回值',
    endEip: execution[execution.length - 1].address + 4,
  }
}

// ---------------------------------------------------------------------------
// 案例 2：局部变量与 EBP 相对寻址
// ---------------------------------------------------------------------------

const localVariablesScenario = (): Scenario => {
  const mainSpec: FunctionSpec = {
    id: 'main',
    name: 'main',
    signature: 'main()',
    tone: 'blue',
    baseAddress: 0x00401000,
    sourceFunctionId: 'main',
    steps: [
      {
        id: 'locals-main-call',
        cLine: 11,
        op: { type: 'call', targetFunctionId: 'calculate', argsBytes: 0 },
      },
      { id: 'locals-main-pop-ebp', cLine: 12, op: { type: 'pop-ebp' } },
      { id: 'locals-main-ret', cLine: 12, op: { type: 'ret' } },
    ],
  }

  const calculateSpec: FunctionSpec = {
    id: 'calculate',
    name: 'calculate',
    signature: 'calculate()',
    tone: 'green',
    baseAddress: 0x00401040,
    sourceFunctionId: 'calculate',
    steps: [
      { id: 'locals-calc-push-ebp', cLine: 2, op: { type: 'push-ebp' } },
      { id: 'locals-calc-mov-ebp', cLine: 2, op: { type: 'mov-ebp-esp' } },
      {
        id: 'locals-calc-sub',
        cLine: 2,
        op: {
          type: 'sub-esp',
          bytes: 16,
          purpose: 'locals',
          label: 'a / b / c 局部变量槽',
          effectLabel: '预留 16 B 局部变量区',
        },
      },
      {
        id: 'locals-calc-a',
        cLine: 3,
        op: { type: 'mov-mem-imm', offset: -4, value: 10, variable: 'a' },
      },
      {
        id: 'locals-calc-b',
        cLine: 4,
        op: { type: 'mov-mem-imm', offset: -8, value: 20, variable: 'b' },
      },
      {
        id: 'locals-calc-eax-a',
        cLine: 5,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: -4, variable: 'a' },
      },
      {
        id: 'locals-calc-add-b',
        cLine: 5,
        op: { type: 'add-reg-mem', register: 'eax', base: 'ebp', offset: -8, variable: 'b' },
      },
      {
        id: 'locals-calc-store-c',
        cLine: 5,
        op: { type: 'mov-mem-reg', offset: -12, register: 'eax', variable: 'c' },
      },
      {
        id: 'locals-calc-eax-c',
        cLine: 6,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: -12, variable: 'c' },
      },
      { id: 'locals-calc-release', cLine: 7, op: { type: 'mov-esp-ebp' } },
      { id: 'locals-calc-pop-ebp', cLine: 7, op: { type: 'pop-ebp' } },
      { id: 'locals-calc-ret', cLine: 7, op: { type: 'ret' } },
    ],
  }

  const program = buildProgram([mainSpec, calculateSpec])
  const execution = selectExecutionOrder(program, [
    'locals-main-call',
    'locals-calc-push-ebp',
    'locals-calc-mov-ebp',
    'locals-calc-sub',
    'locals-calc-a',
    'locals-calc-b',
    'locals-calc-eax-a',
    'locals-calc-add-b',
    'locals-calc-store-c',
    'locals-calc-eax-c',
    'locals-calc-release',
    'locals-calc-pop-ebp',
    'locals-calc-ret',
    'locals-main-pop-ebp',
    'locals-main-ret',
  ])

  return {
    id: 'local-variables',
    title: '带局部变量的函数',
    shortTitle: '局部变量',
    subtitle: 'EBP / SUB ESP / [EBP−n]',
    description:
      'calculate() 用 sub esp, 16 预留局部变量区，并通过 [ebp−4]、[ebp−8]、[ebp−12] 访问 a、b、c。',
    level: '入门',
    tags: ['EBP', 'SUB ESP', '局部变量', 'Debug Fill'],
    learningPoints: [
      'sub esp, N 只是移动栈顶，不会自动初始化',
      '局部变量通过 [EBP−n] 稳定寻址',
      '释放局部变量区不会擦除旧数据',
    ],
    compiler: teachingProfile(
      '手写教学汇编，突出 EBP 相对寻址与 Debug Fill，不声明为任何编译器的实时输出。',
    ),
    cSource: makeSource(
      [
        'int calculate()',
        '{',
        '    int a = 10;',
        '    int b = 20;',
        '    int c = a + b;',
        '    return c;',
        '}',
        '',
        'int main()',
        '{',
        '    return calculate();',
        '}',
      ].join('\n'),
      [
        {
          id: 'calculate',
          name: 'calculate',
          signature: 'int calculate()',
          startLine: 1,
          endLine: 7,
        },
        { id: 'main', name: 'main', signature: 'int main()', startLine: 9, endLine: 12 },
      ],
    ),
    variables: [
      {
        name: 'a',
        functionId: 'calculate',
        line: 3,
        typeLabel: 'int',
        storage: 'stack',
        offset: -4,
      },
      {
        name: 'b',
        functionId: 'calculate',
        line: 4,
        typeLabel: 'int',
        storage: 'stack',
        offset: -8,
      },
      {
        name: 'c',
        functionId: 'calculate',
        line: 5,
        typeLabel: 'int',
        storage: 'stack',
        offset: -12,
      },
    ],
    codeGroups: program.codeGroups,
    instructions: execution,
    stackTop: STACK_TOP,
    stackBottom: STACK_BOTTOM,
    initialState: () => createEstablishedMain({ eip: execution[0].address }),
    resultLabel: 'calculate() 返回值',
    endEip: execution[execution.length - 1].address + 4,
  }
}

// ---------------------------------------------------------------------------
// 案例 3：保存 EBX / ESI / EDI
// ---------------------------------------------------------------------------

const calleeSavedScenario = (): Scenario => {
  const mainSpec: FunctionSpec = {
    id: 'main',
    name: 'main',
    signature: 'main()',
    tone: 'blue',
    baseAddress: 0x00401000,
    sourceFunctionId: 'main',
    steps: [
      {
        id: 'saved-main-push-a',
        cLine: 10,
        op: { type: 'push-imm', value: 10, argument: 'a' },
      },
      {
        id: 'saved-main-call',
        cLine: 10,
        op: { type: 'call', targetFunctionId: 'work', argsBytes: 4 },
      },
      {
        id: 'saved-main-cleanup',
        cLine: 10,
        op: { type: 'add-esp', bytes: 4, label: '调用者清理参数 a' },
      },
      { id: 'saved-main-pop-ebp', cLine: 11, op: { type: 'pop-ebp' } },
      { id: 'saved-main-ret', cLine: 11, op: { type: 'ret' } },
    ],
  }

  const workSpec: FunctionSpec = {
    id: 'work',
    name: 'work',
    signature: 'work(a)',
    tone: 'green',
    baseAddress: 0x00401040,
    sourceFunctionId: 'work',
    steps: [
      { id: 'saved-work-push-ebp', cLine: 2, op: { type: 'push-ebp' } },
      { id: 'saved-work-mov-ebp', cLine: 2, op: { type: 'mov-ebp-esp' } },
      {
        id: 'saved-work-push-ebx',
        cLine: 2,
        op: { type: 'push-reg', register: 'ebx' },
        title: '保存 callee-saved 寄存器 EBX',
      },
      {
        id: 'saved-work-push-esi',
        cLine: 2,
        op: { type: 'push-reg', register: 'esi' },
        title: '保存 callee-saved 寄存器 ESI',
      },
      {
        id: 'saved-work-push-edi',
        cLine: 2,
        op: { type: 'push-reg', register: 'edi' },
        title: '保存 callee-saved 寄存器 EDI',
      },
      {
        id: 'saved-work-sub',
        cLine: 2,
        op: {
          type: 'sub-esp',
          bytes: 16,
          purpose: 'locals',
          label: 'x / y 与对齐空间',
          effectLabel: '预留 16 B（含对齐）',
        },
      },
      {
        id: 'saved-work-x',
        cLine: 3,
        op: { type: 'mov-mem-imm', offset: -16, value: 10, variable: 'x' },
      },
      {
        id: 'saved-work-y',
        cLine: 4,
        op: { type: 'mov-mem-imm', offset: -20, value: 20, variable: 'y' },
      },
      {
        id: 'saved-work-eax-a',
        cLine: 5,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: 8, variable: 'a' },
      },
      {
        id: 'saved-work-ebx-x',
        cLine: 5,
        op: { type: 'mov-reg-mem', register: 'ebx', base: 'ebp', offset: -16, variable: 'x' },
      },
      {
        id: 'saved-work-add-x',
        cLine: 5,
        op: { type: 'add-reg-reg', dest: 'eax', source: 'ebx' },
      },
      {
        id: 'saved-work-esi-y',
        cLine: 5,
        op: { type: 'mov-reg-mem', register: 'esi', base: 'ebp', offset: -20, variable: 'y' },
      },
      {
        id: 'saved-work-add-y',
        cLine: 5,
        op: { type: 'add-reg-reg', dest: 'eax', source: 'esi' },
      },
      {
        id: 'saved-work-edi-temp',
        cLine: 5,
        op: { type: 'mov-reg-reg', dest: 'edi', source: 'eax' },
      },
      {
        id: 'saved-work-eax-edi',
        cLine: 5,
        op: { type: 'mov-reg-reg', dest: 'eax', source: 'edi' },
      },
      {
        id: 'saved-work-cleanup-locals',
        cLine: 6,
        op: { type: 'add-esp', bytes: 16, label: '先回收局部变量区' },
      },
      { id: 'saved-work-pop-edi', cLine: 6, op: { type: 'pop-reg', register: 'edi' } },
      { id: 'saved-work-pop-esi', cLine: 6, op: { type: 'pop-reg', register: 'esi' } },
      { id: 'saved-work-pop-ebx', cLine: 6, op: { type: 'pop-reg', register: 'ebx' } },
      { id: 'saved-work-mov-esp', cLine: 6, op: { type: 'mov-esp-ebp' } },
      { id: 'saved-work-pop-ebp', cLine: 6, op: { type: 'pop-ebp' } },
      { id: 'saved-work-ret', cLine: 6, op: { type: 'ret' } },
    ],
  }

  const program = buildProgram([mainSpec, workSpec])
  const execution = selectExecutionOrder(program, [
    'saved-main-push-a',
    'saved-main-call',
    'saved-work-push-ebp',
    'saved-work-mov-ebp',
    'saved-work-push-ebx',
    'saved-work-push-esi',
    'saved-work-push-edi',
    'saved-work-sub',
    'saved-work-x',
    'saved-work-y',
    'saved-work-eax-a',
    'saved-work-ebx-x',
    'saved-work-add-x',
    'saved-work-esi-y',
    'saved-work-add-y',
    'saved-work-edi-temp',
    'saved-work-eax-edi',
    'saved-work-cleanup-locals',
    'saved-work-pop-edi',
    'saved-work-pop-esi',
    'saved-work-pop-ebx',
    'saved-work-mov-esp',
    'saved-work-pop-ebp',
    'saved-work-ret',
    'saved-main-cleanup',
    'saved-main-pop-ebp',
    'saved-main-ret',
  ])

  return {
    id: 'callee-saved',
    title: '保存 EBX、ESI、EDI',
    shortTitle: 'Callee-saved',
    subtitle: 'PUSH/POP 与 ABI 寄存器保存',
    description:
      'work() 会实际修改 EBX、ESI、EDI，因此按 cdecl 的 callee-saved 约定保存并在返回前逆序恢复。局部变量区同时展示 Debug Fill。',
    level: '进阶',
    tags: ['EBX', 'ESI', 'EDI', 'callee-saved', 'Debug Fill'],
    learningPoints: [
      '被调用者修改 callee-saved 寄存器前必须保存',
      '恢复顺序与保存顺序相反',
      '真正写入局部变量前，预留空间仍保持填充值',
    ],
    compiler: teachingProfile(
      '教学示意汇编：为了展示 ABI，函数显式使用了 EBX/ESI/EDI。真实编译器只在确实需要时才保存这些寄存器。',
    ),
    cSource: makeSource(
      [
        'int work(int a)',
        '{',
        '    int x = 10;',
        '    int y = 20;',
        '    return a + x + y;',
        '}',
        '',
        'int main()',
        '{',
        '    return work(10);',
        '}',
      ].join('\n'),
      [
        { id: 'work', name: 'work', signature: 'int work(int a)', startLine: 1, endLine: 6 },
        { id: 'main', name: 'main', signature: 'int main()', startLine: 8, endLine: 11 },
      ],
    ),
    variables: [
      { name: 'a', functionId: 'work', line: 1, typeLabel: 'int', storage: 'stack', offset: 8 },
      { name: 'x', functionId: 'work', line: 3, typeLabel: 'int', storage: 'stack', offset: -16 },
      { name: 'y', functionId: 'work', line: 4, typeLabel: 'int', storage: 'stack', offset: -20 },
    ],
    codeGroups: program.codeGroups,
    instructions: execution,
    stackTop: STACK_TOP,
    stackBottom: STACK_BOTTOM,
    initialState: () =>
      createEstablishedMain({
        eip: execution[0].address,
        registers: {
          ...defaultRegisters,
          ebx: 0xb0000001,
          esi: 0x51000002,
          edi: 0xed000003,
        },
      }),
    resultLabel: 'work() 返回值',
    endEip: execution[execution.length - 1].address + 4,
  }
}

// ---------------------------------------------------------------------------
// 案例 4：Linux ELF 启动过程
// ---------------------------------------------------------------------------

const startupScenario = (): Scenario => {
  const loaderSpec: FunctionSpec = {
    id: 'kernel',
    name: '内核 (OS)',
    signature: 'loader',
    tone: 'slate',
    baseAddress: 0x08048ff0,
    sourceFunctionId: null,
    isSystem: true,
    steps: [
      {
        id: 'loader-init-stack',
        phase: 'A',
        op: {
          type: 'os-init-stack',
          label: '内核：映射 ELF 并建立初始用户栈',
          writes: [
            { address: 0x2000, value: 1, type: 'argc', label: 'argc = 1' },
            {
              address: 0x2004,
              value: 0x00402000,
              type: 'argv',
              label: 'argv[0] → 程序路径',
            },
            { address: 0x2008, value: 0, type: 'argv', label: 'argv[1] = NULL' },
            {
              address: 0x200c,
              value: 0x00402020,
              type: 'envp',
              label: 'envp[0] → PATH=…',
            },
            { address: 0x2010, value: 0, type: 'envp', label: 'envp[1] = NULL' },
            { address: 0x2014, value: 4096, type: 'auxv', label: 'AT_PAGESZ = 4096' },
          ],
        },
        assembly: 'kernel: setup_initial_stack',
        title: '操作系统建立初始用户栈',
        explanation:
          '这一步不是 CPU 执行的 x86 指令，而是内核/装载器在程序开始运行前完成的工作：为新进程映射内存映像，把 argc、argv 指针数组、环境变量指针和辅助向量（auxv）写入用户栈。',
        reason:
          '执行后 ESP = {espA}，栈顶是 argc。注意：此时还没有任何 C 函数栈帧，main 的返回地址也还不存在；这些单元属于“进程初始栈”，不是 main 的局部变量。',
      },
    ],
  }

  const startSpec: FunctionSpec = {
    id: '_start',
    name: '_start',
    signature: '_start()',
    tone: 'violet',
    baseAddress: 0x08049000,
    sourceFunctionId: null,
    usesFramePointer: false,
    steps: [
      {
        id: 'start-xor-ebp',
        phase: 'B',
        op: { type: 'xor-reg-reg', register: 'ebp' },
        title: '清零 EBP，标记最外层栈边界',
        explanation:
          'Linux ELF 入口由内核直接跳入 _start。清零 EBP 后，调试器可以把这里识别为最外层调用边界。',
        reason:
          'EBP 从 {ebpB} 变为 0，ESP 不变。此时还没有建立 C 函数的栈帧；_start 不是 C 语言的 main。',
      },
      {
        id: 'start-mov-edi',
        phase: 'B',
        op: {
          type: 'mov-reg-imm',
          register: 'edi',
          value: 0x00401000,
          display: 'main',
        },
        assembly: 'mov edi, main',
        title: '把 main() 地址写入 EDI',
        explanation:
          '启动代码准备把 C 函数 main 的地址作为参数交给运行时。不同 CRT 的具体寄存器用法会不同，这里是简化的 Linux 教学模型。',
        reason:
          'EDI 被写为 main 的入口地址，ESP 与栈内存不变。main 还没有开始执行。',
      },
      {
        id: 'start-push-argv',
        phase: 'B',
        op: {
          type: 'push-imm',
          value: 0x00402000,
          display: 'argv',
          label: 'argv 指针',
        },
        assembly: 'push argv',
        title: '压入 argv 参数',
        explanation:
          '为简化运行时调用，把 argv 指针传给 __libc_start_main。真实 glibc 的启动调用包含更多参数和平台相关细节。',
        reason:
          'ESP 从 {espB} 减到 {espA}，新单元位于 {espA}。这是 _start 为运行时函数准备的传出参数。',
      },
      {
        id: 'start-push-argc',
        phase: 'B',
        op: { type: 'push-imm', value: 1, argument: 'argc' },
        title: '压入 argc 参数',
        explanation:
          '把参数个数压栈。初始栈中的 argc 来自操作系统加载器；这里用常量 1 表示简化场景。',
        reason:
          'ESP 再次减 4 到 {espA}。EBP 仍为 0，因为 _start 没有建立 EBP 帧。',
      },
      {
        id: 'start-push-main',
        phase: 'B',
        op: {
          type: 'push-reg',
          register: 'edi',
          label: 'main 函数地址',
          saveAsCallee: false,
        },
        assembly: 'push edi',
        title: '压入 main() 函数地址',
        explanation:
          '把 main 的地址作为运行时函数的第一个 cdecl 参数压栈。main 是一个普通函数，只是由启动代码负责调用。',
        reason:
          'ESP 从 {espB} 变为 {espA}。此时栈上依次保存 argv、argc、main。',
      },
      {
        id: 'start-call-libc',
        phase: 'B',
        op: { type: 'call', targetFunctionId: '__libc_start_main', argsBytes: 12 },
        title: '调用 __libc_start_main（简化）',
        explanation:
          '简化模型用 __libc_start_main 代表运行时初始化。CALL 会把返回地址压栈，并跳入运行时启动函数。',
        reason:
          'CALL 压入返回地址后 ESP 变为 {espA}，EIP 跳到运行时入口。严格来说，真实 glibc 的参数和实现更复杂；本案例明确是概念模拟。',
      },
      {
        id: 'start-add-esp',
        phase: 'D',
        op: { type: 'add-esp', bytes: 12, label: '运行时返回后清理启动参数' },
        title: '清理启动参数',
        explanation:
          '运行时函数返回后，_start 回收之前为简化调用压入的三个参数。',
        reason:
          'ESP 从 {espB} 增加到 {espA}。这些单元被标记为已释放，但数据作为残留保留。',
      },
      {
        id: 'start-mov-eax-exit',
        phase: 'D',
        op: {
          type: 'mov-reg-imm',
          register: 'eax',
          value: 1,
          display: '1',
        },
        assembly: 'mov eax, 1',
        title: '准备 exit 系统调用号',
        explanation:
          'Linux 32-bit 中 EAX = 1 表示 exit 系统调用。程序不通过 ret 离开 _start，而是进入内核退出。',
        reason:
          'EAX 从 {eaxB} 变为 1。用户栈和栈帧不再变化；接下来 EBX 将提供退出码。',
      },
      {
        id: 'start-xor-ebx',
        phase: 'D',
        op: { type: 'xor-reg-reg', register: 'ebx' },
        title: '设置退出码为 0',
        explanation:
          'EBX 保存 exit 的退出码。xor ebx, ebx 将其清零。',
        reason: 'EBX 从 {ebxB} 变为 0；ESP、EBP 不变。',
      },
      {
        id: 'start-int80',
        phase: 'D',
        op: { type: 'int', code: 0x80 },
        title: '进入内核并结束进程',
        explanation:
          'int 0x80 触发 32-bit Linux 系统调用。EAX=1 表示 exit，EBX=0 表示正常退出。',
        reason:
          '用户态程序结束。栈上的旧帧、返回地址和局部变量不会被 CPU 自动清零；它们只是失去有效性。',
      },
    ],
  }

  const libcSpec: FunctionSpec = {
    id: '__libc_start_main',
    name: '__libc_start_main',
    signature: '__libc_start_main(main, argc, argv)',
    tone: 'amber',
    baseAddress: 0x08049040,
    sourceFunctionId: null,
    steps: [
      {
        id: 'libc-push-ebp',
        phase: 'C',
        op: { type: 'push-ebp' },
        title: '运行时函数建立自己的栈帧',
        explanation:
          '运行时启动函数也是一个普通函数，需要保存调用者的 EBP，然后才能调用 main。',
      },
      {
        id: 'libc-mov-ebp',
        phase: 'C',
        op: { type: 'mov-ebp-esp' },
        title: '建立 __libc_start_main 的 EBP',
        explanation:
          'EBP 现在指向运行时的栈帧基准，main 的参数将从这里向低地址继续准备。',
      },
      {
        id: 'libc-sub-esp',
        phase: 'C',
        op: {
          type: 'sub-esp',
          bytes: 8,
          purpose: 'alignment',
          label: '运行时局部/对齐空间',
          effectLabel: '运行时预留 8 B',
        },
        title: '预留运行时局部空间',
        explanation:
          '运行时也有自己的局部变量和对齐需求。这里用 8 字节示意，并受 Debug Fill 设置影响。',
      },
      {
        id: 'libc-push-argv',
        phase: 'C',
        op: {
          type: 'push-mem',
          base: 'ebp',
          offset: 16,
          label: 'argv',
        },
        title: '把 argv 交给 main',
        explanation:
          '从自己的参数区读取 argv，并压栈，准备按 cdecl 调用 main(argc, argv)。',
        reason:
          '读取 [EBP+16] 中的 argv 并压栈。ESP 从 {espB} 变为 {espA}，参数归属于即将创建的 main 帧。',
      },
      {
        id: 'libc-push-argc',
        phase: 'C',
        op: {
          type: 'push-mem',
          base: 'ebp',
          offset: 12,
          label: 'argc',
        },
        title: '把 argc 交给 main',
        explanation:
          '从自己的参数区读取 argc 并压栈。现在 main 的两个参数已经按 cdecl 顺序准备好。',
        reason:
          'ESP 再次减 4 到 {espA}。接下来 CALL main 将压入返回地址并建立新的 C 函数栈帧。',
      },
      {
        id: 'libc-call-main',
        phase: 'C',
        op: { type: 'call', targetFunctionId: 'main', argsBytes: 8 },
        title: '运行时调用 main()',
        explanation:
          'main 并不是程序入口。它在 Linux 启动流程中由运行时启动代码像普通函数一样调用。',
        reason:
          'CALL 压入返回地址到 {espA}，EIP 跳到 main。main 开始执行自己的序言，建立独立栈帧。',
      },
      {
        id: 'libc-add-esp',
        phase: 'D',
        op: { type: 'add-esp', bytes: 8, label: '回收 main 的参数' },
        title: '清理 main 的参数',
        explanation:
          'main 返回后，运行时调用者按 cdecl 约定清理 argc / argv 占用的参数空间。',
      },
      {
        id: 'libc-mov-esp',
        phase: 'D',
        op: { type: 'mov-esp-ebp' },
        title: '释放运行时局部变量区',
        explanation: '把 ESP 拉回 EBP，丢弃 __libc_start_main 的局部/对齐空间。',
      },
      {
        id: 'libc-pop-ebp',
        phase: 'D',
        op: { type: 'pop-ebp' },
        title: '恢复 _start 的 EBP',
        explanation: '弹出保存的旧 EBP，函数帧进入拆除阶段。',
      },
      {
        id: 'libc-ret',
        phase: 'D',
        op: { type: 'ret' },
        title: '运行时返回 _start',
        explanation: 'ret 取回 _start 中的返回地址，控制流回到启动代码。',
      },
    ],
  }

  const mainSpec: FunctionSpec = {
    id: 'main',
    name: 'main',
    signature: 'main(argc, argv)',
    tone: 'blue',
    baseAddress: 0x00401000,
    sourceFunctionId: 'main',
    steps: [
      { id: 'startup-main-push-ebp', cLine: 2, op: { type: 'push-ebp' }, phase: 'C' },
      { id: 'startup-main-mov-ebp', cLine: 2, op: { type: 'mov-ebp-esp' }, phase: 'C' },
      {
        id: 'startup-main-sub',
        cLine: 2,
        phase: 'C',
        op: {
          type: 'sub-esp',
          bytes: 12,
          purpose: 'locals',
          label: 'a / b / c 局部变量槽',
          effectLabel: '为 a / b / c 预留 12 B',
        },
      },
      {
        id: 'startup-main-a',
        cLine: 3,
        phase: 'C',
        op: { type: 'mov-mem-imm', offset: -4, value: 10, variable: 'a' },
      },
      {
        id: 'startup-main-b',
        cLine: 4,
        phase: 'C',
        op: { type: 'mov-mem-imm', offset: -8, value: 20, variable: 'b' },
      },
      {
        id: 'startup-main-eax-a',
        cLine: 5,
        phase: 'C',
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: -4, variable: 'a' },
      },
      {
        id: 'startup-main-add-b',
        cLine: 5,
        phase: 'C',
        op: { type: 'add-reg-mem', register: 'eax', base: 'ebp', offset: -8, variable: 'b' },
      },
      {
        id: 'startup-main-store-c',
        cLine: 5,
        phase: 'C',
        op: { type: 'mov-mem-reg', offset: -12, register: 'eax', variable: 'c' },
      },
      {
        id: 'startup-main-eax-c',
        cLine: 6,
        phase: 'C',
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: -12, variable: 'c' },
      },
      { id: 'startup-main-release', cLine: 7, phase: 'C', op: { type: 'mov-esp-ebp' } },
      { id: 'startup-main-pop-ebp', cLine: 7, phase: 'C', op: { type: 'pop-ebp' } },
      { id: 'startup-main-ret', cLine: 7, phase: 'C', op: { type: 'ret' } },
    ],
  }

  const program = buildProgram([loaderSpec, startSpec, libcSpec, mainSpec])
  const execution = selectExecutionOrder(program, [
    'loader-init-stack',
    'start-xor-ebp',
    'start-mov-edi',
    'start-push-argv',
    'start-push-argc',
    'start-push-main',
    'start-call-libc',
    'libc-push-ebp',
    'libc-mov-ebp',
    'libc-sub-esp',
    'libc-push-argv',
    'libc-push-argc',
    'libc-call-main',
    'startup-main-push-ebp',
    'startup-main-mov-ebp',
    'startup-main-sub',
    'startup-main-a',
    'startup-main-b',
    'startup-main-eax-a',
    'startup-main-add-b',
    'startup-main-store-c',
    'startup-main-eax-c',
    'startup-main-release',
    'startup-main-pop-ebp',
    'startup-main-ret',
    'libc-add-esp',
    'libc-mov-esp',
    'libc-pop-ebp',
    'libc-ret',
    'start-add-esp',
    'start-mov-eax-exit',
    'start-xor-ebx',
    'start-int80',
  ])

  const startupTop = 0x2020
  const startupBottom = 0x1f40

  const phaseMeta = [
    {
      id: 'A',
      label: 'A · 加载程序',
      color: '#8ea4bf',
      description:
        '内核映射 ELF 内存映像，建立初始用户栈（argc、argv、envp、auxv），并设置程序入口地址。此时 main 还没有被调用。',
    },
    {
      id: 'B',
      label: 'B · 进入 _start',
      color: '#b28cff',
      description: '从 ELF 入口 _start 开始，准备运行时参数并调用 __libc_start_main。',
    },
    {
      id: 'C',
      label: 'C · 运行时调用 main',
      color: '#4d9dff',
      description: '运行时压入 main 的参数，CALL main，main 建立自己的 EBP 栈帧并运行。',
    },
    {
      id: 'D',
      label: 'D · 返回与退出',
      color: '#37d99b',
      description: 'main 返回运行时，运行时返回 _start，最终通过 int 0x80 退出。',
    },
  ]

  // 阶段边界由指令上的 phase 标记推导，避免增删指令后手写 fromStep/toStep 失配。
  const phases: ScenarioPhase[] = phaseMeta.map((entry) => {
    const steps = execution
      .map((instruction, index) => (instruction.phase === entry.id ? index + 1 : 0))
      .filter((step) => step > 0)
    return {
      ...entry,
      fromStep: entry.id === 'A' ? 0 : (steps[0] ?? 1),
      toStep: steps[steps.length - 1] ?? 1,
    }
  })

  return {
    id: 'startup',
    title: 'main() 之前的启动过程',
    shortTitle: '程序启动',
    subtitle: 'ELF / _start / __libc_start_main',
    description:
      '从操作系统建立的初始栈开始，经过 _start、简化运行时，直到运行时 CALL main、main 建帧并返回退出。真实启动流程依赖 OS、CRT 与 ABI，本案例是简化的 Linux ELF 概念模型。',
    level: '深入',
    tags: ['ELF', '_start', '__libc_start_main', 'argc/argv', 'exit'],
    learningPoints: [
      '_start 是 ELF 入口，不是 C 的 main',
      'main 由 C 运行时启动代码调用，仍然遵循 cdecl',
      '初始栈包含 argc、argv、envp 等启动数据',
      '进程退出通过系统调用，不依赖普通函数 ret',
    ],
    compiler: teachingProfile(
      '这是按 Linux 32-bit ELF / glibc 概念整理的教学启动序列，简化了 glibc 参数与实现细节，不是真实 CRT 的逐指令复刻。',
    ),
    cSource: makeSource(
      [
        'int main(int argc, char **argv)',
        '{',
        '    int a = 10;',
        '    int b = 20;',
        '    int c = a + b;',
        '    return c;',
        '}',
      ].join('\n'),
      [
        {
          id: 'main',
          name: 'main',
          signature: 'int main(int argc, char **argv)',
          startLine: 1,
          endLine: 7,
        },
      ],
    ),
    variables: [
      { name: 'argc', functionId: 'main', line: 1, typeLabel: 'int', storage: 'stack', offset: 8 },
      {
        name: 'argv',
        functionId: 'main',
        line: 1,
        typeLabel: 'char **',
        storage: 'stack',
        offset: 12,
      },
      { name: 'a', functionId: 'main', line: 3, typeLabel: 'int', storage: 'stack', offset: -4 },
      { name: 'b', functionId: 'main', line: 4, typeLabel: 'int', storage: 'stack', offset: -8 },
      { name: 'c', functionId: 'main', line: 5, typeLabel: 'int', storage: 'stack', offset: -12 },
    ],
    codeGroups: program.codeGroups,
    instructions: execution,
    stackTop: startupTop,
    stackBottom: startupBottom,
    phases,
    initialState: () => {
      const kernel = setupFrame({
        id: 'kernel@initial',
        functionId: 'kernel',
        name: '初始进程栈',
        signature: '内核写入的进程初始栈',
        tone: 'slate',
        entryESP: 0x2000,
        currentESP: 0x2000,
        status: 'waiting',
        returnTo: '操作系统',
      })
      const start = setupFrame({
        id: '_start@initial',
        functionId: '_start',
        name: '_start',
        signature: '_start()',
        tone: 'violet',
        entryESP: 0x2000,
        currentESP: 0x2000,
        returnTo: '内核入口',
        callerId: kernel.id,
        status: 'active',
      })
      return createInitialState({
        stackTop: startupTop,
        stackBottom: startupBottom,
        esp: 0x2000,
        ebp: 0,
        eip: execution[0].address,
        frames: [kernel, start],
        // 初始用户栈此时还是空的：argc/argv/envp/auxv 由第 1 步“内核建立初始栈”写入。
        cells: [],
      })
    },
    resultLabel: 'main() 返回值',
    endEip: execution[execution.length - 1].address + 4,
  }
}

// ---------------------------------------------------------------------------
// 案例 5：嵌套函数调用
// ---------------------------------------------------------------------------

const nestedScenario = (): Scenario => {
  const mainSpec: FunctionSpec = {
    id: 'main',
    name: 'main',
    signature: 'main()',
    tone: 'blue',
    baseAddress: 0x00401000,
    sourceFunctionId: 'main',
    steps: [
      {
        id: 'nested-main-sub',
        cLine: 14,
        op: {
          type: 'sub-esp',
          bytes: 4,
          purpose: 'locals',
          label: 'z 的局部变量槽',
          effectLabel: '为 z 预留 4 B',
        },
      },
      {
        id: 'nested-main-z',
        cLine: 15,
        op: { type: 'mov-mem-imm', offset: -4, value: 10, variable: 'z' },
      },
      {
        id: 'nested-main-call-b',
        cLine: 16,
        op: { type: 'call', targetFunctionId: 'b', argsBytes: 0 },
      },
      {
        id: 'nested-main-add-z',
        cLine: 16,
        op: { type: 'add-reg-mem', register: 'eax', base: 'ebp', offset: -4, variable: 'z' },
      },
      { id: 'nested-main-release', cLine: 17, op: { type: 'mov-esp-ebp' } },
      { id: 'nested-main-pop-ebp', cLine: 17, op: { type: 'pop-ebp' } },
      { id: 'nested-main-ret', cLine: 17, op: { type: 'ret' } },
    ],
  }

  const bSpec: FunctionSpec = {
    id: 'b',
    name: 'b',
    signature: 'b()',
    tone: 'teal',
    baseAddress: 0x00401040,
    sourceFunctionId: 'b',
    steps: [
      { id: 'nested-b-push-ebp', cLine: 8, op: { type: 'push-ebp' } },
      { id: 'nested-b-mov-ebp', cLine: 8, op: { type: 'mov-ebp-esp' } },
      {
        id: 'nested-b-sub',
        cLine: 8,
        op: {
          type: 'sub-esp',
          bytes: 4,
          purpose: 'locals',
          label: 'y 的局部变量槽',
          effectLabel: '为 y 预留 4 B',
        },
      },
      {
        id: 'nested-b-y',
        cLine: 9,
        op: { type: 'mov-mem-imm', offset: -4, value: 20, variable: 'y' },
      },
      {
        id: 'nested-b-call-c',
        cLine: 10,
        op: { type: 'call', targetFunctionId: 'c', argsBytes: 0 },
      },
      {
        id: 'nested-b-add-y',
        cLine: 10,
        op: { type: 'add-reg-mem', register: 'eax', base: 'ebp', offset: -4, variable: 'y' },
      },
      { id: 'nested-b-release', cLine: 11, op: { type: 'mov-esp-ebp' } },
      { id: 'nested-b-pop-ebp', cLine: 11, op: { type: 'pop-ebp' } },
      { id: 'nested-b-ret', cLine: 11, op: { type: 'ret' } },
    ],
  }

  const cSpec: FunctionSpec = {
    id: 'c',
    name: 'c',
    signature: 'c()',
    tone: 'violet',
    baseAddress: 0x00401080,
    sourceFunctionId: 'c',
    steps: [
      { id: 'nested-c-push-ebp', cLine: 2, op: { type: 'push-ebp' } },
      { id: 'nested-c-mov-ebp', cLine: 2, op: { type: 'mov-ebp-esp' } },
      {
        id: 'nested-c-sub',
        cLine: 2,
        op: {
          type: 'sub-esp',
          bytes: 4,
          purpose: 'locals',
          label: 'x 的局部变量槽',
          effectLabel: '为 x 预留 4 B',
        },
      },
      {
        id: 'nested-c-x',
        cLine: 3,
        op: { type: 'mov-mem-imm', offset: -4, value: 30, variable: 'x' },
      },
      {
        id: 'nested-c-eax-x',
        cLine: 4,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: -4, variable: 'x' },
      },
      { id: 'nested-c-release', cLine: 5, op: { type: 'mov-esp-ebp' } },
      { id: 'nested-c-pop-ebp', cLine: 5, op: { type: 'pop-ebp' } },
      { id: 'nested-c-ret', cLine: 5, op: { type: 'ret' } },
    ],
  }

  const program = buildProgram([mainSpec, bSpec, cSpec])
  const execution = selectExecutionOrder(program, [
    'nested-main-sub',
    'nested-main-z',
    'nested-main-call-b',
    'nested-b-push-ebp',
    'nested-b-mov-ebp',
    'nested-b-sub',
    'nested-b-y',
    'nested-b-call-c',
    'nested-c-push-ebp',
    'nested-c-mov-ebp',
    'nested-c-sub',
    'nested-c-x',
    'nested-c-eax-x',
    'nested-c-release',
    'nested-c-pop-ebp',
    'nested-c-ret',
    'nested-b-add-y',
    'nested-b-release',
    'nested-b-pop-ebp',
    'nested-b-ret',
    'nested-main-add-z',
    'nested-main-release',
    'nested-main-pop-ebp',
    'nested-main-ret',
  ])

  return {
    id: 'nested',
    title: '嵌套函数调用',
    shortTitle: '嵌套调用',
    subtitle: 'main → b → c · 三帧同栈',
    description:
      'main、b、c 依次嵌套调用。栈内存中同时出现三个独立帧，每个函数保留自己的 ESP / EBP 快照；返回时逐层销毁。',
    level: '进阶',
    tags: ['嵌套栈帧', '多 ESP', '帧边界', '返回链'],
    learningPoints: [
      '调用者的 ESP 快照在 callee 执行期间保持不变',
      '不同函数栈帧通过返回地址和保存的 EBP 连接',
      '返回时按嵌套顺序逐层拆除栈帧',
    ],
    compiler: teachingProfile(
      '手写教学汇编，用于清晰展示三层栈帧和 ESP 历史快照，不是编译器实时输出。',
    ),
    cSource: makeSource(
      [
        'int c()',
        '{',
        '    int x = 30;',
        '    return x;',
        '}',
        '',
        'int b()',
        '{',
        '    int y = 20;',
        '    return c() + y;',
        '}',
        '',
        'int main()',
        '{',
        '    int z = 10;',
        '    return b() + z;',
        '}',
      ].join('\n'),
      [
        { id: 'c', name: 'c', signature: 'int c()', startLine: 1, endLine: 5 },
        { id: 'b', name: 'b', signature: 'int b()', startLine: 7, endLine: 11 },
        { id: 'main', name: 'main', signature: 'int main()', startLine: 13, endLine: 17 },
      ],
    ),
    variables: [
      { name: 'x', functionId: 'c', line: 3, typeLabel: 'int', storage: 'stack', offset: -4 },
      { name: 'y', functionId: 'b', line: 9, typeLabel: 'int', storage: 'stack', offset: -4 },
      { name: 'z', functionId: 'main', line: 15, typeLabel: 'int', storage: 'stack', offset: -4 },
    ],
    codeGroups: program.codeGroups,
    instructions: execution,
    stackTop: STACK_TOP,
    stackBottom: STACK_BOTTOM,
    initialState: () => createEstablishedMain({ eip: execution[0].address }),
    resultLabel: 'main() 返回值',
    endEip: execution[execution.length - 1].address + 4,
  }
}

// ---------------------------------------------------------------------------
// 案例 6：优化概念与寄存器变量
// ---------------------------------------------------------------------------

const optimizedScenario = (): Scenario => {
  const mainSpec: FunctionSpec = {
    id: 'main',
    name: 'main',
    signature: 'main()',
    tone: 'blue',
    baseAddress: 0x00401000,
    sourceFunctionId: 'main',
    usesFramePointer: false,
    steps: [
      { id: 'opt-main-push-ebx', cLine: 7, op: { type: 'push-reg', register: 'ebx' } },
      { id: 'opt-main-push-esi', cLine: 7, op: { type: 'push-reg', register: 'esi' } },
      {
        id: 'opt-main-x',
        cLine: 8,
        op: { type: 'mov-reg-imm', register: 'ebx', value: 10 },
        title: 'x 被优化到 EBX 寄存器',
        explanation:
          '编译器优化后，局部变量 x 不一定要占用栈空间。这里把 x 保存在 callee-saved 寄存器 EBX 中。',
        reason:
          '这条 mov 不访问栈。x 的存储位置是 EBX，ESP / EBP 保持不变。因此点击变量 x 应该定位到寄存器，而不是栈行。',
      },
      {
        id: 'opt-main-y',
        cLine: 9,
        op: { type: 'mov-reg-imm', register: 'esi', value: 20 },
        title: 'y 被优化到 ESI 寄存器',
        explanation:
          'y 同样被优化到寄存器 ESI。栈上不会出现 y 的变量槽。',
        reason:
          'ESI 从 {esiB} 变为 {esiA}；栈内存不变。寄存器变量不具备栈地址。',
      },
      {
        id: 'opt-main-push-b',
        cLine: 10,
        op: {
          type: 'push-reg',
          register: 'esi',
          label: '参数 b（来自 y）',
          saveAsCallee: false,
        },
        title: '把寄存器变量 y 作为参数 b 压栈',
        explanation:
          'y 当前保存在 ESI 中，没有栈地址。调用 add 前，main 把它作为 cdecl 的第二个参数复制到栈上。',
        reason:
          'ESI 的值 20 被压入栈顶，ESP 从 {espB} 变为 {espA}。参数区是调用协议要求的副本，不会改变 y 在寄存器中的存储方式。',
      },
      {
        id: 'opt-main-push-a',
        cLine: 10,
        op: {
          type: 'push-reg',
          register: 'ebx',
          label: '参数 a（来自 x）',
          saveAsCallee: false,
        },
        title: '把寄存器变量 x 作为参数 a 压栈',
        explanation:
          'x 当前保存在 EBX 中。为了让 cdecl 的 add 能读取第一个参数，main 把 EBX 的值压入栈顶。',
        reason:
          'EBX 的值 10 被压入栈顶，ESP 再次减 4 到 {espA}。x 仍然定位到寄存器 EBX，栈上的单元只是传给 add 的参数副本。',
      },
      {
        id: 'opt-main-call',
        cLine: 10,
        op: { type: 'call', targetFunctionId: 'add', argsBytes: 8 },
      },
      {
        id: 'opt-main-cleanup',
        cLine: 10,
        op: { type: 'add-esp', bytes: 8, label: '调用者清理参数' },
      },
      { id: 'opt-main-pop-esi', cLine: 11, op: { type: 'pop-reg', register: 'esi' } },
      { id: 'opt-main-pop-ebx', cLine: 11, op: { type: 'pop-reg', register: 'ebx' } },
      { id: 'opt-main-ret', cLine: 11, op: { type: 'ret' } },
    ],
  }

  const addSpec: FunctionSpec = {
    id: 'add',
    name: 'add',
    signature: 'add(a, b)',
    tone: 'green',
    baseAddress: 0x00401040,
    sourceFunctionId: 'add',
    usesFramePointer: false,
    steps: [
      {
        id: 'opt-add-a',
        cLine: 3,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'esp', offset: 4, variable: 'a' },
        title: '通过 ESP 直接读取参数 a',
        explanation:
          '在优化构建中，编译器可能省略 EBP 帧指针，直接用 ESP 加偏移访问参数。',
        reason:
          '参数 a 位于 [ESP+4]（越过返回地址）。指令将其读入 EAX，ESP / EBP 不变化。',
      },
      {
        id: 'opt-add-b',
        cLine: 3,
        op: { type: 'add-reg-mem', register: 'eax', base: 'esp', offset: 8, variable: 'b' },
        title: '通过 ESP 直接读取参数 b',
        explanation:
          '第二个参数在 [ESP+8]。EAX 加上 b 后得到 a + b。',
      },
      { id: 'opt-add-ret', cLine: 4, op: { type: 'ret' } },
    ],
  }

  const program = buildProgram([mainSpec, addSpec])
  const execution = selectExecutionOrder(program, [
    'opt-main-push-ebx',
    'opt-main-push-esi',
    'opt-main-x',
    'opt-main-y',
    'opt-main-push-b',
    'opt-main-push-a',
    'opt-main-call',
    'opt-add-a',
    'opt-add-b',
    'opt-add-ret',
    'opt-main-cleanup',
    'opt-main-pop-esi',
    'opt-main-pop-ebx',
    'opt-main-ret',
  ])

  return {
    id: 'optimized-registers',
    title: '优化概念：寄存器变量',
    shortTitle: '寄存器变量',
    subtitle: '省略 EBP · x/y 在寄存器',
    description:
      '演示优化场景下局部变量被提升到 EBX / ESI，以及函数省略 EBP、直接用 ESP 寻址参数。变量面板会明确标记“寄存器变量”，不会伪造栈地址。',
    level: '深入',
    tags: ['优化', '寄存器变量', '省略 EBP', 'ESP 寻址'],
    learningPoints: [
      '优化后局部变量可能只存在于寄存器',
      '启用帧指针省略后，参数可用 ESP 相对地址访问',
      'callee-saved 寄存器仍必须在修改前保存',
    ],
    compiler: teachingProfile(
      '教学示意 · 优化概念。没有调用真实 GCC/Clang 生成此汇编，因此不标记为真实编译器输出。',
    ),
    cSource: makeSource(
      [
        'int add(int a, int b)',
        '{',
        '    return a + b;',
        '}',
        '',
        'int main()',
        '{',
        '    int x = 10;',
        '    int y = 20;',
        '    return add(x, y);',
        '}',
      ].join('\n'),
      [
        { id: 'add', name: 'add', signature: 'int add(int a, int b)', startLine: 1, endLine: 4 },
        { id: 'main', name: 'main', signature: 'int main()', startLine: 6, endLine: 11 },
      ],
    ),
    variables: [
      {
        name: 'x',
        functionId: 'main',
        line: 8,
        typeLabel: 'int',
        storage: 'register',
        register: 'ebx',
        note: '编译器把 x 提升到 callee-saved 寄存器 EBX',
      },
      {
        name: 'y',
        functionId: 'main',
        line: 9,
        typeLabel: 'int',
        storage: 'register',
        register: 'esi',
        note: '编译器把 y 提升到 callee-saved 寄存器 ESI',
      },
      {
        name: 'a',
        functionId: 'add',
        line: 1,
        typeLabel: 'int',
        storage: 'stack',
        base: 'esp',
        offset: 4,
        note: '无 EBP 帧，通过 [ESP+4] 访问',
      },
      {
        name: 'b',
        functionId: 'add',
        line: 1,
        typeLabel: 'int',
        storage: 'stack',
        base: 'esp',
        offset: 8,
        note: '无 EBP 帧，通过 [ESP+8] 访问',
      },
    ],
    codeGroups: program.codeGroups,
    instructions: execution,
    stackTop: STACK_TOP,
    stackBottom: STACK_BOTTOM,
    initialState: () => {
      const frame = setupFrame({
        id: 'main@entry',
        functionId: 'main',
        name: 'main',
        signature: 'main()',
        tone: 'blue',
        entryESP: 0x1000,
        currentESP: 0x1000,
        frameBase: null,
        returnAddress: MAIN_RETURN,
        returnTo: '运行时启动代码',
        status: 'active',
      })
      return createInitialState({
        stackTop: STACK_TOP,
        stackBottom: STACK_BOTTOM,
        esp: 0x1000,
        ebp: 0,
        eip: execution[0].address,
        registers: {
          ...defaultRegisters,
          ebx: 0xb0000001,
          esi: 0x51000002,
        },
        frames: [frame],
        cells: [
          {
            address: 0x1000,
            value: MAIN_RETURN,
            type: 'return',
            label: 'main 返回地址',
            frameId: frame.id,
            sourceInstruction: 'call main（案例起点之前）',
          },
        ],
      })
    },
    resultLabel: 'add() 返回值',
    endEip: execution[execution.length - 1].address + 4,
  }
}

// ---------------------------------------------------------------------------
// 案例 7：main 自己的局部变量（从 main 入口开始）
// ---------------------------------------------------------------------------

const mainLocalsScenario = (): Scenario => {
  const mainSpec: FunctionSpec = {
    id: 'main',
    name: 'main',
    signature: 'main()',
    tone: 'blue',
    baseAddress: 0x00401000,
    sourceFunctionId: 'main',
    steps: [
      {
        id: 'mloc-push-ebp',
        cLine: 2,
        op: { type: 'push-ebp' },
        title: 'main 保存调用者的旧 EBP',
        explanation:
          'main 开始建立自己的栈帧。它先把调用者（运行时）当前的 EBP 压栈保存，返回时再恢复，避免破坏调用者的栈帧基准。',
        reason:
          'push 先把 ESP 减 4，再把 EBP = {ebpB} 写入新的栈顶 {espA}。这块单元被标记为“main 保存的旧 EBP”，它和返回地址是两个不同的单元。',
      },
      {
        id: 'mloc-mov-ebp',
        cLine: 2,
        op: { type: 'mov-ebp-esp' },
        title: 'main 建立自己的栈帧基准',
        explanation:
          'mov ebp, esp 把当前栈顶复制给 EBP。此后 EBP 固定不动，局部变量通过 [ebp−4]、[ebp−8] 访问。',
        reason:
          'EBP 从 {ebpB} 变为 {ebpA}，与 ESP = {espA} 重合。ESP 不变。旧 EBP 仍保存在 [ebp]，返回地址在 [ebp+4]。',
      },
      {
        id: 'mloc-sub',
        cLine: 2,
        op: {
          type: 'sub-esp',
          bytes: 12,
          purpose: 'locals',
          label: 'a / b / c 局部变量槽',
          effectLabel: '为 a / b / c 预留 12 B',
        },
        title: '为三个 int 预留 12 字节',
        explanation:
          'sub esp, 12 只是把栈顶向低地址移动 12 字节，CPU 不会初始化这块空间。变量还没有值。',
        reason:
          'ESP 从 {espB} 变为 {espA}，EBP 保持 {ebpA}。三个 4 字节槽位分别是 [ebp−4]、[ebp−8]、[ebp−12]，现在处于“已预留、未初始化”状态。',
      },
      {
        id: 'mloc-a',
        cLine: 3,
        op: { type: 'mov-mem-imm', offset: -4, value: 10, variable: 'a' },
        title: '把 10 写入 [ebp−4]，a 诞生',
        explanation:
          '这是第一条真正写局部变量的指令。mov 把十进制 10 转成 0x0000000A，写入 EBP−4 指向的栈单元。',
        reason:
          '目标地址 = EBP {ebpA} + (−4) = {espA} 上方第 1 个槽位。写入后 a 从“未初始化”变成“已初始化”，ESP 与 EBP 都不变。',
      },
      {
        id: 'mloc-b',
        cLine: 4,
        op: { type: 'mov-mem-imm', offset: -8, value: 20, variable: 'b' },
        title: '把 20 写入 [ebp−8]，b 诞生',
        explanation: '第二条 mov 写入第二个局部变量槽。',
        reason:
          '目标地址 = EBP {ebpA} + (−8)。b 从调试填充/未初始化变成 20；未初始化的槽位会明显减少。',
      },
      {
        id: 'mloc-eax-a',
        cLine: 5,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: -4, variable: 'a' },
      },
      {
        id: 'mloc-add-b',
        cLine: 5,
        op: { type: 'add-reg-mem', register: 'eax', base: 'ebp', offset: -8, variable: 'b' },
      },
      {
        id: 'mloc-store-c',
        cLine: 5,
        op: { type: 'mov-mem-reg', offset: -12, register: 'eax', variable: 'c' },
        title: '把 EAX 写入 [ebp−12]，c 得到结果',
        explanation:
          'a + b 的结果先存在于 EAX，随后被写回第三个栈槽，成为变量 c。局部变量是靠内存写入产生的，不是被 CALL 出来的。',
        reason:
          '目标地址 = EBP {ebpA} + (−12) = {espA}（栈顶槽）。写入后 c 初始化完成，EAX 暂存值与 c 内容相同。',
      },
      {
        id: 'mloc-eax-c',
        cLine: 6,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: -12, variable: 'c' },
      },
      { id: 'mloc-release', cLine: 7, op: { type: 'mov-esp-ebp' } },
      { id: 'mloc-pop-ebp', cLine: 7, op: { type: 'pop-ebp' } },
      { id: 'mloc-ret', cLine: 7, op: { type: 'ret' } },
    ],
  }

  const program = buildProgram([mainSpec])
  const execution = selectExecutionOrder(program, [
    'mloc-push-ebp',
    'mloc-mov-ebp',
    'mloc-sub',
    'mloc-a',
    'mloc-b',
    'mloc-eax-a',
    'mloc-add-b',
    'mloc-store-c',
    'mloc-eax-c',
    'mloc-release',
    'mloc-pop-ebp',
    'mloc-ret',
  ])

  return {
    id: 'main-locals',
    title: 'main 的局部变量',
    shortTitle: 'main 局部变量',
    subtitle: 'SUB ESP 12 · [EBP−4/−8/−12]',
    description:
      '从 main 刚被 CALL 进来的那一刻开始：只有返回地址在栈上，逐条执行 push ebp / mov ebp, esp / sub esp, 12，再用 mov 给 a、b、c 赋值。',
    level: '入门',
    tags: ['SUB ESP', 'EBP 相对寻址', '局部变量', 'Debug Fill'],
    learningPoints: [
      'CALL 只压入返回地址，不创建完整栈帧',
      'push ebp 保存旧 EBP，mov ebp, esp 固定帧基准',
      'sub esp 只预留空间，mov 才真正产生变量',
      '[ebp−4] 的有效地址 = EBP + (−4)',
    ],
    compiler: teachingProfile(
      '手写教学汇编，逐条展开 EBP 帧建立与 [ebp−n] 寻址；不是 GCC 的实时输出。真实 GCC -O0 的序言会包含对齐与安全检查指令。',
    ),
    cSource: makeSource(
      [
        'int main()',
        '{',
        '    int a = 10;',
        '    int b = 20;',
        '    int c = a + b;',
        '    return c;',
        '}',
      ].join('\n'),
      [{ id: 'main', name: 'main', signature: 'int main()', startLine: 1, endLine: 7 }],
    ),
    variables: [
      { name: 'a', functionId: 'main', line: 3, typeLabel: 'int', storage: 'stack', offset: -4 },
      { name: 'b', functionId: 'main', line: 4, typeLabel: 'int', storage: 'stack', offset: -8 },
      { name: 'c', functionId: 'main', line: 5, typeLabel: 'int', storage: 'stack', offset: -12 },
    ],
    codeGroups: program.codeGroups,
    instructions: execution,
    stackTop: STACK_TOP,
    stackBottom: STACK_BOTTOM,
    initialState: () => createMainAtEntry({ eip: execution[0].address }),
    resultLabel: 'main() 返回值',
    endEip: execution[execution.length - 1].address + 4,
  }
}

// ---------------------------------------------------------------------------
// 案例 8：main 调用 add（两个栈帧 + cdecl 参数 + 返回值）
// ---------------------------------------------------------------------------

const mainAddScenario = (): Scenario => {
  const mainSpec: FunctionSpec = {
    id: 'main',
    name: 'main',
    signature: 'main()',
    tone: 'blue',
    baseAddress: 0x00401000,
    sourceFunctionId: 'main',
    steps: [
      { id: 'madd-push-ebp', cLine: 9, op: { type: 'push-ebp' } },
      { id: 'madd-mov-ebp', cLine: 9, op: { type: 'mov-ebp-esp' } },
      {
        id: 'madd-sub',
        cLine: 9,
        op: {
          type: 'sub-esp',
          bytes: 12,
          purpose: 'locals',
          label: 'x / y / sum 局部变量槽',
          effectLabel: '为 x / y / sum 预留 12 B',
        },
      },
      {
        id: 'madd-x',
        cLine: 10,
        op: { type: 'mov-mem-imm', offset: -4, value: 10, variable: 'x' },
      },
      {
        id: 'madd-y',
        cLine: 11,
        op: { type: 'mov-mem-imm', offset: -8, value: 20, variable: 'y' },
      },
      {
        id: 'madd-push-y',
        cLine: 12,
        op: { type: 'push-mem', base: 'ebp', offset: -8, label: '参数 b（y）' },
        title: '按 cdecl 先压入第二个参数 y',
        explanation:
          'cdecl 的参数从右向左入栈：先压 b，再压 a。这样第一个参数总是离返回地址更近。',
        reason:
          '指令读取 [EBP−8] 中的 20，再执行 push。ESP 从 {espB} 变为 {espA}。这块单元暂时属于调用者的参数区，CALL 之后会转交给 add 的栈帧。',
      },
      {
        id: 'madd-push-x',
        cLine: 12,
        op: { type: 'push-mem', base: 'ebp', offset: -4, label: '参数 a（x）' },
        title: '压入第一个参数 x',
        explanation: '参数 a 最后入栈，因此它在被调用者眼中位于 [ebp+8]。',
        reason:
          '读取 [EBP−4] 中的 10 并压栈，ESP 变为 {espA}。此时 add 的两个参数都在栈上，x、y 自己的局部变量槽没有变化。',
      },
      {
        id: 'madd-call',
        cLine: 12,
        op: { type: 'call', targetFunctionId: 'add', argsBytes: 8 },
      },
      {
        id: 'madd-cleanup',
        cLine: 12,
        op: { type: 'add-esp', bytes: 8, label: '调用者清理两个参数' },
      },
      {
        id: 'madd-store-sum',
        cLine: 12,
        op: { type: 'mov-mem-reg', offset: -12, register: 'eax', variable: 'sum' },
        title: '把 add 的返回值 EAX 写入 sum',
        explanation:
          'add 通过 EAX 返回结果。main 把 EAX 写入自己的第三个局部变量槽，得到变量 sum。',
        reason:
          '目标地址 = EBP {ebpA} + (−12)。这一步把“被调用者的返回值”变成“调用者的局部变量”，ESP 与 EBP 不变。',
      },
      {
        id: 'madd-eax-sum',
        cLine: 13,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: -12, variable: 'sum' },
      },
      { id: 'madd-release', cLine: 14, op: { type: 'mov-esp-ebp' } },
      { id: 'madd-pop-ebp', cLine: 14, op: { type: 'pop-ebp' } },
      { id: 'madd-ret', cLine: 14, op: { type: 'ret' } },
    ],
  }

  const addSpec: FunctionSpec = {
    id: 'add',
    name: 'add',
    signature: 'add(a, b)',
    tone: 'green',
    baseAddress: 0x00401040,
    sourceFunctionId: 'add',
    steps: [
      { id: 'madd-add-push-ebp', cLine: 2, op: { type: 'push-ebp' } },
      { id: 'madd-add-mov-ebp', cLine: 2, op: { type: 'mov-ebp-esp' } },
      {
        id: 'madd-add-sub',
        cLine: 2,
        op: {
          type: 'sub-esp',
          bytes: 4,
          purpose: 'locals',
          label: 'result 局部变量槽',
          effectLabel: '为 result 预留 4 B',
        },
      },
      {
        id: 'madd-add-eax-a',
        cLine: 3,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: 8, variable: 'a' },
      },
      {
        id: 'madd-add-b',
        cLine: 3,
        op: { type: 'add-reg-mem', register: 'eax', base: 'ebp', offset: 12, variable: 'b' },
      },
      {
        id: 'madd-add-result',
        cLine: 3,
        op: { type: 'mov-mem-reg', offset: -4, register: 'eax', variable: 'result' },
      },
      {
        id: 'madd-add-eax-result',
        cLine: 4,
        op: { type: 'mov-reg-mem', register: 'eax', base: 'ebp', offset: -4, variable: 'result' },
      },
      { id: 'madd-add-release', cLine: 5, op: { type: 'mov-esp-ebp' } },
      { id: 'madd-add-pop-ebp', cLine: 5, op: { type: 'pop-ebp' } },
      { id: 'madd-add-ret', cLine: 5, op: { type: 'ret' } },
    ],
  }

  const program = buildProgram([mainSpec, addSpec])
  const execution = selectExecutionOrder(program, [
    'madd-push-ebp',
    'madd-mov-ebp',
    'madd-sub',
    'madd-x',
    'madd-y',
    'madd-push-y',
    'madd-push-x',
    'madd-call',
    'madd-add-push-ebp',
    'madd-add-mov-ebp',
    'madd-add-sub',
    'madd-add-eax-a',
    'madd-add-b',
    'madd-add-result',
    'madd-add-eax-result',
    'madd-add-release',
    'madd-add-pop-ebp',
    'madd-add-ret',
    'madd-cleanup',
    'madd-store-sum',
    'madd-eax-sum',
    'madd-release',
    'madd-pop-ebp',
    'madd-ret',
  ])

  return {
    id: 'main-add',
    title: 'main 调用 add：两个栈帧',
    shortTitle: 'main → add',
    subtitle: 'cdecl 参数 · 嵌套栈帧 · EAX 返回值',
    description:
      'main 先建立自己的栈帧和 x、y、sum 三个局部变量，再按 cdecl 从右向左压入参数、CALL add。add 建立独立栈帧，返回后栈帧释放，返回值经 EAX 写回 sum。',
    level: '进阶',
    tags: ['cdecl', 'CALL', '参数传递', '嵌套栈帧', 'RET'],
    learningPoints: [
      '参数由调用者压栈，CALL 再压入返回地址',
      'add 的 [ebp+8]、[ebp+12] 正是 main 压入的两个参数',
      '被调用者的局部变量在它自己的栈帧里',
      '返回值通过 EAX 传回，不占栈',
      'RET 之后 add 的栈帧释放，但旧值仍残留',
    ],
    compiler: teachingProfile(
      '手写教学汇编，完整展示 cdecl 参数、两个栈帧与返回值路径；不是 GCC 的实时输出。真实 GCC -O0 可能在序言中额外做栈对齐。',
    ),
    cSource: makeSource(
      [
        'int add(int a, int b)',
        '{',
        '    int result = a + b;',
        '    return result;',
        '}',
        '',
        'int main()',
        '{',
        '    int x = 10;',
        '    int y = 20;',
        '    int sum = add(x, y);',
        '    return sum;',
        '}',
      ].join('\n'),
      [
        { id: 'add', name: 'add', signature: 'int add(int a, int b)', startLine: 1, endLine: 5 },
        { id: 'main', name: 'main', signature: 'int main()', startLine: 7, endLine: 13 },
      ],
    ),
    variables: [
      { name: 'x', functionId: 'main', line: 9, typeLabel: 'int', storage: 'stack', offset: -4 },
      { name: 'y', functionId: 'main', line: 10, typeLabel: 'int', storage: 'stack', offset: -8 },
      {
        name: 'sum',
        functionId: 'main',
        line: 11,
        typeLabel: 'int',
        storage: 'stack',
        offset: -12,
      },
      { name: 'a', functionId: 'add', line: 1, typeLabel: 'int', storage: 'stack', offset: 8 },
      { name: 'b', functionId: 'add', line: 1, typeLabel: 'int', storage: 'stack', offset: 12 },
      {
        name: 'result',
        functionId: 'add',
        line: 3,
        typeLabel: 'int',
        storage: 'stack',
        offset: -4,
      },
    ],
    codeGroups: program.codeGroups,
    instructions: execution,
    stackTop: STACK_TOP,
    stackBottom: STACK_BOTTOM,
    initialState: () => createMainAtEntry({ eip: execution[0].address, signature: 'main()' }),
    resultLabel: 'main() 返回值',
    endEip: execution[execution.length - 1].address + 4,
  }
}

export const SCENARIOS: Scenario[] = [
  // 默认入口：从操作系统建立初始栈开始，而不是一上来就出现 main 栈帧。
  startupScenario(),
  mainLocalsScenario(),
  basicCallScenario(),
  mainAddScenario(),
  calleeSavedScenario(),
  nestedScenario(),
  localVariablesScenario(),
  optimizedScenario(),
]

export const DEFAULT_SCENARIO_ID = SCENARIOS[0].id

export const getScenario = (id: string): Scenario =>
  SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0]

export { STACK_TOP, STACK_BOTTOM, MAIN_RETURN }
