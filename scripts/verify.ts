/**
 * StackLab 无头验收脚本。
 *
 * 直接跑真实的模拟时间线（不经过 DOM），把每个案例的关键教学不变量断言一遍：
 * CALL 压返回地址、序言建帧、sub esp 只预留、mov 才初始化、callee-saved 恢复、
 * 多帧不重叠、上一步等价于历史快照等。
 *
 * 用法：npm run verify
 */
import { buildTimeline } from '../src/simulator/engine'
import { SCENARIOS, getScenario } from '../src/simulator/scenarios'
import { useSimulatorStore } from '../src/store/simulatorStore'
import type { SimulatorState, TimelineEntry } from '../src/simulator/types'
import { hexAddress } from '../src/simulator/utils'

let failures = 0
let checks = 0

const ok = (condition: boolean, message: string): void => {
  checks += 1
  if (condition) {
    console.log(`  \u2713 ${message}`)
  } else {
    failures += 1
    console.log(`  \u2717 ${message}`)
  }
}

const eq = (actual: unknown, expected: unknown, message: string): void => {
  ok(
    actual === expected,
    `${message} (实际 ${String(actual)} / 期望 ${String(expected)})`,
  )
}

const cellOf = (state: SimulatorState, address: number) =>
  state.memory.find((cell) => cell.address === address)

const stepOf = (timeline: TimelineEntry[], id: string): number =>
  timeline.findIndex((entry) => entry.instruction?.id === id)

const stateAfter = (timeline: TimelineEntry[], id: string): SimulatorState => {
  const index = stepOf(timeline, id)
  if (index < 0) throw new Error(`找不到指令 ${id}`)
  return timeline[index].state
}

const addressOf = (timeline: TimelineEntry[], id: string): number | undefined =>
  timeline[stepOf(timeline, id)]?.instruction?.address

const frameOf = (state: SimulatorState, functionId: string) =>
  state.callStack.find((frame) => frame.functionId === functionId)

const genericChecks = (scenarioId: string): void => {
  const scenario = getScenario(scenarioId)
  const timeline = buildTimeline(scenario, { debugFill: true })
  console.log(`\n[${scenario.id}] ${scenario.title} · ${timeline.length - 1} 步`)

  eq(
    timeline.length - 1,
    scenario.instructions.length,
    '时间线步数 = 指令数',
  )

  const first = timeline[0].state
  ok(first.finished === false, '第 0 步未结束')

  // 内存单元基本形状 + 地址范围
  let shapeOk = true
  let sourceOk = true
  for (const [index, entry] of timeline.entries()) {
    const state = entry.state
    if (state.esp < state.stackBottom || state.esp > state.stackTop) shapeOk = false
    for (const cell of state.memory) {
      if (cell.size !== 4) shapeOk = false
      if (cell.address > state.stackTop || cell.address < state.stackBottom) shapeOk = false
      if (index > 0 && cell.isAllocated && !cell.sourceInstruction) sourceOk = false
    }
  }
  ok(shapeOk, '每个栈单元 4 B，且所有地址落在栈范围内')
  ok(sourceOk, '第 1 步之后，每个占用单元都记录了来源指令')

  // 帧范围与归属一致性
  let frameOk = true
  for (const entry of timeline) {
    const state = entry.state
    for (const frame of state.callStack) {
      if (frame.size > 0 && frame.stackStart > frame.stackEnd) frameOk = false
      if (frame.size < 0) frameOk = false
      const owned = state.memory.filter(
        (cell) => cell.frameId === frame.id && cell.isAllocated,
      )
      if (owned.length > 0) {
        const min = Math.min(...owned.map((cell) => cell.address))
        const max = Math.max(...owned.map((cell) => cell.address))
        if (frame.stackStart !== min || frame.stackEnd !== max) {
          frameOk = false
          if (process.env.DEBUG_RANGE) {
            console.log(
              `    ! ${scenarioId} step ${entry.state.currentInstructionIndex} ${frame.name} ${hexAddress(frame.stackStart)}-${hexAddress(frame.stackEnd)} vs cells ${hexAddress(min)}-${hexAddress(max)} (${frame.status})`,
            )
          }
        }
      }
    }
  }
  ok(frameOk, '活动帧的 stackStart/stackEnd 与内存归属一致')

  // 地址分解与实际访问地址一致
  let addressingOk = true
  for (const [index, entry] of timeline.entries()) {
    const instruction = entry.instruction
    if (!instruction?.addressing || index === 0) continue
    const before = timeline[index - 1].state
    const after = entry.state
    const base = instruction.addressing.base === 'ebp' ? before.ebp : before.esp
    const target = base + instruction.addressing.offset
    if (instruction.addressing.kind === 'read') {
      // 读取类指令：目标单元必须真实存在且已占用
      const cell = cellOf(after, target)
      if (!cell?.isAllocated) addressingOk = false
    } else if (!after.lastEffect?.addresses.includes(target)) {
      // 写入 / lea：效果地址必须正好是分解出来的目标地址
      addressingOk = false
    }
  }
  ok(addressingOk, '[ebp/esp±disp] 地址分解与实际访问地址一致')

  const final = timeline[timeline.length - 1].state
  ok(final.finished === true, `最终状态标记完成`)
  console.log(
    `  · 结束：EAX ${hexAddress(final.eax)} · main 返回 ${final.mainReturnValue} · exit ${
      final.processExitCode ?? '—'
    }`,
  )
}

// ---------------------------------------------------------------------------

const checkStartup = (): void => {
  const scenario = getScenario('startup')
  const timeline = buildTimeline(scenario, { debugFill: true })
  console.log(`\n[startup] 启动过程专项`)

  const entry = timeline[0].state
  ok(
    entry.memory.every((cell) => !cell.isAllocated),
    '第 0 步：栈是完全空的，没有任何变量/返回地址',
  )
  ok(
    !entry.callStack.some((frame) => frame.functionId === 'main'),
    '第 0 步：main 栈帧还不存在',
  )
  eq(entry.callStack.length, 2, '第 0 步：只有 初始栈 + _start 两条记录')

  const afterLoader = stateAfter(timeline, 'loader-init-stack')
  eq(cellOf(afterLoader, 0x2000)?.value, 1, '内核写入了 argc = 1')
  eq(
    cellOf(afterLoader, 0x2000)?.type,
    'argc',
    'argc 单元类型标记为 argc',
  )
  eq(cellOf(afterLoader, 0x2004)?.value, 0x00402000, 'argv[0] 指针已写入')
  eq(cellOf(afterLoader, 0x2014)?.value, 4096, 'auxv AT_PAGESZ 已写入')
  const initialFrame = afterLoader.callStack.find((frame) =>
    frame.name.includes('初始'),
  )
  eq(
    cellOf(afterLoader, 0x2000)?.frameId,
    initialFrame?.id,
    '初始栈数据归属于「初始进程栈」区域，而不是 _start 帧',
  )
  eq(
    afterLoader.callStack.find((frame) => frame.functionId === '_start')?.size,
    0,
    '_start 还没有占用任何栈空间',
  )
  ok(
    !afterLoader.callStack.some((frame) => frame.functionId === 'main'),
    '初始栈建立后 main 仍未执行',
  )

  const callStep = stepOf(timeline, 'libc-call-main')
  const beforeCall = timeline[callStep - 1].state
  const afterCall = timeline[callStep].state
  const mainFrame = frameOf(afterCall, 'main')

  eq(afterCall.esp, beforeCall.esp - 4, 'CALL main 使 ESP 减 4')
  const retCell = cellOf(afterCall, afterCall.esp)
  const expectedReturn = addressOf(timeline, 'libc-add-esp')
  eq(retCell?.value, expectedReturn, '栈顶写入的正是 CALL 之后那条指令的地址')
  eq(retCell?.type, 'return', '该单元类型为“返回地址”')
  ok(
    (retCell?.label ?? '').includes('main'),
    `返回地址标签标明所属函数（"${retCell?.label}"）`,
  )
  eq(retCell?.frameId, mainFrame?.id, '返回地址归属于 main 栈帧')
  eq(retCell?.sourceInstruction, 'call main', '来源指令记录为 call main')
  eq(
    mainFrame?.returnAddress,
    expectedReturn,
    'main 帧的 returnAddress = CALL 下一条指令',
  )
  ok(
    retCell?.value !== addressOf(timeline, 'startup-main-push-ebp'),
    '返回地址不是 main 自己的入口地址（由调用者压入，而非 main 产生）',
  )

  const afterFrame = stateAfter(timeline, 'startup-main-mov-ebp')
  const mainNow = frameOf(afterFrame, 'main')
  eq(mainNow?.frameBase, afterFrame.esp, 'mov ebp, esp 后 EBP 与 ESP 重合')
  eq(
    cellOf(afterFrame, afterFrame.esp)?.type,
    'saved-ebp',
    'EBP 指向的单元是保存的旧 EBP（不是返回地址）',
  )
  ok(
    (cellOf(afterFrame, afterFrame.esp)?.label ?? '').includes('main 保存的旧 EBP'),
    '旧 EBP 标签标明 main',
  )
  eq(
    cellOf(afterFrame, afterFrame.esp + 4)?.type,
    'return',
    'EBP+4 才是返回地址',
  )

  const afterSub = stateAfter(timeline, 'startup-main-sub')
  const reserved = [afterSub.esp, afterSub.esp + 4, afterSub.esp + 8]
  ok(
    reserved.every((address) => {
      const cell = cellOf(afterSub, address)
      return cell?.isAllocated === true && cell.value === 0xcccccccc
    }),
    'sub esp, 12 预留 3 个槽位并填充 0xCCCCCCCC',
  )

  const afterC = stateAfter(timeline, 'startup-main-store-c')
  const cCell = cellOf(afterC, (frameOf(afterC, 'main')?.frameBase ?? 0) - 12)
  eq(cCell?.value, 30, 'c = a + b = 30 真正写入内存')
  eq(cCell?.isInitialized, true, 'c 标记为已初始化')
  ok(cCell?.fillKind === null, '写入后不再带 DEBUG FILL 标记')

  const final = timeline[timeline.length - 1].state
  eq(final.mainReturnValue, 30, 'main 返回 30')
  eq(final.processExitCode, 0, '进程 exit 0')
  eq(final.callStack.length, 0, '退出后没有活动栈帧')
}

const checkMainLocals = (): void => {
  const scenario = getScenario('main-locals')
  const timeline = buildTimeline(scenario, { debugFill: true })
  console.log(`\n[main-locals] main 局部变量专项`)

  const entry = timeline[0].state
  eq(cellOf(entry, 0x1000)?.type, 'return', '入口处栈顶只有返回地址')
  ok(
    entry.memory.every((cell) => cell.type !== 'saved-ebp' || !cell.isAllocated),
    '入口处还没有保存的旧 EBP',
  )

  const afterPush = stateAfter(timeline, 'mloc-push-ebp')
  eq(cellOf(afterPush, 0x0ffc)?.value, 0x1018, 'push ebp 保存了调用者的 EBP')
  eq(afterPush.esp, 0x0ffc, 'ESP = 0x0FFC')

  const afterSub = stateAfter(timeline, 'mloc-sub')
  eq(afterSub.esp, 0x0ff0, 'sub esp, 12 后 ESP = 0x0FF0')
  const slots = [0x0ff8, 0x0ff4, 0x0ff0]
  ok(
    slots.every((address) => cellOf(afterSub, address)?.isInitialized === false),
    '三个槽位都还是未初始化（sub 不会初始化）',
  )

  const afterA = stateAfter(timeline, 'mloc-a')
  eq(cellOf(afterA, 0x0ff8)?.value, 10, 'a 写入 [ebp−4] = 0x0FF8')

  const final = timeline[timeline.length - 1].state
  eq(final.eax, 30, 'main 通过 EAX 返回 30')
  eq(final.mainReturnValue, 30, 'main 返回值记录为 30')
  eq(final.callStack.length, 0, 'main 返回后调用栈为空')
}

const checkMainAdd = (): void => {
  const scenario = getScenario('main-add')
  const timeline = buildTimeline(scenario, { debugFill: true })
  console.log(`\n[main-add] main → add 专项`)

  const beforeCall = timeline[stepOf(timeline, 'madd-call') - 1].state
  const afterCall = stateAfter(timeline, 'madd-call')
  const addFrame = frameOf(afterCall, 'add')
  ok(!!addFrame, 'CALL 之后 add 栈帧进入调用栈')
  eq(afterCall.esp, beforeCall.esp - 4, 'CALL 压入返回地址')
  eq(
    cellOf(afterCall, afterCall.esp)?.value,
    addressOf(timeline, 'madd-cleanup'),
    '返回地址 = CALL 的下一条指令（调用者中的回收参数）',
  )

  const afterAddFrame = stateAfter(timeline, 'madd-add-mov-ebp')
  const addNow = frameOf(afterAddFrame, 'add')
  const base = addNow?.frameBase ?? 0
  eq(cellOf(afterAddFrame, base + 8)?.value, 10, 'add 看到的 [ebp+8] = 参数 a = 10')
  eq(cellOf(afterAddFrame, base + 12)?.value, 20, 'add 看到的 [ebp+12] = 参数 b = 20')
  eq(cellOf(afterAddFrame, base + 8)?.type, 'parameter', '参数单元类型为 parameter')

  const afterCalc = stateAfter(timeline, 'madd-add-eax-result')
  eq(afterCalc.eax, 30, 'add 通过 EAX 返回 30')

  const afterCleanup = stateAfter(timeline, 'madd-cleanup')
  eq(
    afterCleanup.esp,
    addNow ? addNow.entryESP + 12 : -1,
    '调用者清理 8 字节参数（返回地址 4 + 参数 8）',
  )

  const afterSum = stateAfter(timeline, 'madd-store-sum')
  const mainFrame = frameOf(afterSum, 'main')
  eq(
    cellOf(afterSum, (mainFrame?.frameBase ?? 0) - 12)?.value,
    30,
    'main 的 sum 写入 30',
  )

  const final = timeline[timeline.length - 1].state
  eq(final.mainReturnValue, 30, 'main 返回 30')
  ok(
    final.archivedFrames.some((frame) => frame.functionId === 'add'),
    'add 返回后进入历史帧',
  )
}

const checkCalleeSaved = (): void => {
  const scenario = getScenario('callee-saved')
  const timeline = buildTimeline(scenario, { debugFill: true })
  console.log(`\n[callee-saved] 寄存器保存/恢复专项`)

  const entry = timeline[0].state
  const original = { ebx: entry.ebx, esi: entry.esi, edi: entry.edi }

  const afterPushes = stateAfter(timeline, 'saved-work-push-edi')
  const pushes = ['saved-work-push-ebx', 'saved-work-push-esi', 'saved-work-push-edi']
  ok(
    pushes.every((id) => {
      const address = stateAfter(timeline, id).esp
      return cellOf(afterPushes, address)?.type === 'saved-register'
    }),
    'push ebx/esi/edi 各生成一个“保存寄存器”单元',
  )

  const afterPops = stateAfter(timeline, 'saved-work-pop-ebx')
  eq(afterPops.ebx, original.ebx, 'pop ebx 恢复初始 EBX')
  eq(afterPops.esi, original.esi, 'pop esi 恢复初始 ESI')
  eq(afterPops.edi, original.edi, 'pop edi 恢复初始 EDI')

  const final = timeline[timeline.length - 1].state
  eq(final.ebx, original.ebx, '返回后 EBX 未被破坏')
  eq(final.esi, original.esi, '返回后 ESI 未被破坏')
  eq(final.edi, original.edi, '返回后 EDI 未被破坏')
}

const checkNested = (): void => {
  const scenario = getScenario('nested')
  const timeline = buildTimeline(scenario, { debugFill: true })
  console.log(`\n[nested] 三层嵌套专项`)

  const deepest = stateAfter(timeline, 'nested-c-mov-ebp')
  eq(deepest.callStack.length, 3, '最深处同时存在 3 个活动栈帧')
  const owned = deepest.callStack.map(
    (frame) => new Set(deepest.memory.filter((cell) => cell.frameId === frame.id).map((c) => c.address)),
  )
  let overlap = false
  for (let i = 0; i < owned.length; i += 1) {
    for (let j = i + 1; j < owned.length; j += 1) {
      for (const address of owned[i]) if (owned[j].has(address)) overlap = true
    }
  }
  ok(!overlap, '三个栈帧的内存归属互不重叠')

  const final = timeline[timeline.length - 1].state
  eq(final.eax, 60, 'main 返回 60')
}

const checkResults = (): void => {
  console.log(`\n[results] 各案例最终结果`)
  const expected: Record<string, number> = {
    startup: 30,
    'main-locals': 30,
    'basic-call': 30,
    'main-add': 30,
    'callee-saved': 40,
    nested: 60,
    'local-variables': 30,
    'optimized-registers': 30,
  }
  for (const [id, value] of Object.entries(expected)) {
    const scenario = getScenario(id)
    const timeline = buildTimeline(scenario, { debugFill: true })
    const final = timeline[timeline.length - 1].state
    eq(final.mainReturnValue ?? final.returnValue, value, `${id} 返回值 ${value}`)
  }
}

const checkControls = (): void => {
  console.log(`\n[controls] 执行控制与默认入口`)

  const store = useSimulatorStore.getState()
  eq(store.scenarioId, 'startup', '默认案例是「程序启动」')
  eq(store.currentStep, 0, '默认停在第 0 步')
  eq(
    store.timeline[0].state.callStack.some((frame) => frame.functionId === 'main'),
    false,
    '默认初始状态没有 main 栈帧',
  )

  store.selectScenario('main-add')
  const scenario = useSimulatorStore.getState().scenario
  const callStep =
    scenario.instructions.findIndex((instruction) => instruction.id === 'madd-call') + 1
  useSimulatorStore.getState().jumpTo(callStep + 2)
  const beforeJump = useSimulatorStore.getState()
  eq(
    beforeJump.timeline[beforeJump.currentStep].state.callStack.at(-1)?.functionId,
    'add',
    '跳到 add 执行中',
  )

  useSimulatorStore.getState().runToFunctionEnd()
  const afterJump = useSimulatorStore.getState()
  const boundary = scenario.instructions[afterJump.currentStep]
  eq(boundary?.functionId, 'main', '「到函数结束」停在调用者的下一条指令')
  eq(
    afterJump.timeline[afterJump.currentStep].state.callStack.at(-1)?.functionId,
    'main',
    '到达边界时 add 已返回，main 重新成为当前帧',
  )

  // 上一步必须恢复真实快照，而不是只把动画倒放
  useSimulatorStore.getState().jumpTo(callStep + 4)
  const mid = useSimulatorStore.getState()
  const snapshot = JSON.stringify(mid.timeline[mid.currentStep].state)
  useSimulatorStore.getState().jumpTo(mid.currentStep + 3)
  for (let index = 0; index < 3; index += 1) {
    useSimulatorStore.getState().stepBackward()
  }
  const restored = useSimulatorStore.getState()
  eq(restored.currentStep, mid.currentStep, '连续后退回到同一步号')
  ok(
    JSON.stringify(restored.timeline[restored.currentStep].state) === snapshot,
    '后退后的寄存器/内存/栈帧与历史快照完全一致',
  )
}

// ---------------------------------------------------------------------------

const main = (): void => {
  console.log('StackLab headless verification')
  console.log(`scenarios: ${SCENARIOS.map((scenario) => scenario.id).join(', ')}`)

  for (const scenario of SCENARIOS) genericChecks(scenario.id)
  checkStartup()
  checkMainLocals()
  checkMainAdd()
  checkCalleeSaved()
  checkNested()
  checkControls()
  checkResults()

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} · ${checks - failures}/${checks} checks`)
  if (failures > 0) process.exitCode = 1
}

main()
