import {
  CELL_SIZE,
  DEBUG_FILL_CC,
  type ExecutionContext,
  type FrameTone,
  type MemoryCell,
  type MemoryFill,
  type MemoryType,
  type RegisterName,
  type SimulatorState,
  type StackFrame,
} from './types'
import {
  cloneState,
  findCell,
  hexAddress,
  syncRegisters,
  updateCell,
} from './utils'

const FRAME_TONES: FrameTone[] = ['blue', 'green', 'violet', 'amber', 'teal', 'rose']

export const toneForIndex = (index: number): FrameTone =>
  FRAME_TONES[index % FRAME_TONES.length]

export interface CellSeed {
  address: number
  value: number | null
  type: MemoryType
  label: string
  frameId?: string | null
  isAllocated?: boolean
  isInitialized?: boolean
  variable?: string | null
  fillKind?: MemoryFill
  isAlignment?: boolean
}

export interface InitialStateOptions {
  stackTop: number
  stackBottom: number
  esp: number
  ebp: number
  eip: number
  registers?: Partial<Record<RegisterName, number>>
  cells?: CellSeed[]
  frames?: StackFrame[]
  archivedFrames?: StackFrame[]
}

const createEmptyCell = (address: number): MemoryCell => ({
  address,
  value: null,
  type: 'free',
  label: '空闲',
  frameId: null,
  isAllocated: false,
  isInitialized: false,
  isFreed: false,
  releasedFrameId: null,
  fillKind: null,
  variable: null,
  isAlignment: false,
})

export const createInitialState = ({
  stackTop,
  stackBottom,
  esp,
  ebp,
  eip,
  registers = {},
  cells = [],
  frames = [],
  archivedFrames = [],
}: InitialStateOptions): SimulatorState => {
  const memory: MemoryCell[] = []
  for (let address = stackTop; address >= stackBottom; address -= CELL_SIZE) {
    memory.push(createEmptyCell(address))
  }

  const state: SimulatorState = {
    eax: registers.eax ?? 0,
    ebx: registers.ebx ?? 0,
    ecx: registers.ecx ?? 0,
    edx: registers.edx ?? 0,
    esi: registers.esi ?? 0,
    edi: registers.edi ?? 0,
    esp,
    ebp,
    eip,
    memory,
    registers: {
      eax: 0,
      ebx: 0,
      ecx: 0,
      edx: 0,
      esi: 0,
      edi: 0,
      esp,
      ebp,
      eip,
    },
    currentInstructionIndex: 0,
    executionHistory: [],
    callStack: frames,
    archivedFrames,
    stackTop,
    stackBottom,
    finished: false,
    returnValue: null,
    mainReturnValue: null,
    processExitCode: null,
    lastEffect: null,
  }

  for (const seed of cells) {
    writeCell(state, seed.address, {
      value: seed.value,
      type: seed.type,
      label: seed.label,
      frameId: seed.frameId ?? null,
      isAllocated: seed.isAllocated ?? true,
      isInitialized: seed.isInitialized ?? seed.value !== null,
      variable: seed.variable ?? null,
      fillKind: seed.fillKind ?? null,
      isAlignment: seed.isAlignment ?? false,
    })
  }

  syncRegisters(state)
  recomputeFrames(state)
  return state
}

export interface FrameSeed {
  id: string
  functionId: string
  name: string
  signature: string
  tone: FrameTone
  entryESP: number
  currentESP: number
  entryEBP: number | null
  frameBase: number | null
  savedRegisters?: Record<string, number>
  returnAddress: number | null
  returnTo: string
  callerId: string | null
  status?: StackFrame['status']
  argsBytes?: number
}

export const makeFrame = (seed: FrameSeed): StackFrame => ({
  ...seed,
  frameBase: seed.frameBase,
  stackStart: seed.currentESP,
  stackEnd: seed.currentESP - CELL_SIZE,
  size: 0,
  savedRegisters: seed.savedRegisters ?? {},
  status: seed.status ?? 'active',
})

export const writeCell = (
  state: SimulatorState,
  address: number,
  patch: Partial<MemoryCell> & Pick<MemoryCell, 'value' | 'type' | 'label'>,
): MemoryCell => {
  const cell = findCell(state, address)
  if (!cell) {
    throw new Error(`栈地址 ${hexAddress(address)} 超出当前模拟范围`)
  }
  Object.assign(cell, {
    isAllocated: true,
    isInitialized: patch.value !== null,
    isFreed: false,
    releasedFrameId: null,
    fillKind: null,
    variable: null,
    isAlignment: false,
    frameId: null,
    ...patch,
  })
  return cell
}

export const activeFrame = (state: SimulatorState): StackFrame | undefined =>
  state.callStack[state.callStack.length - 1]

export const pushValue = (
  state: SimulatorState,
  value: number,
  meta: {
    type: MemoryType
    label: string
    frameId: string | null
    variable?: string | null
  },
): number => {
  state.esp -= CELL_SIZE
  writeCell(state, state.esp, {
    value,
    type: meta.type,
    label: meta.label,
    frameId: meta.frameId,
    isAllocated: true,
    isInitialized: true,
    variable: meta.variable ?? null,
    fillKind: null,
    isAlignment: false,
  })
  return state.esp
}

export const pushRegister = (
  state: SimulatorState,
  register: RegisterName,
  frameId: string,
  label?: string,
): number => {
  const value = state[register]
  const address = pushValue(state, value, {
    type: 'saved-register',
    label: label ?? `保存的 ${register.toUpperCase()}`,
    frameId,
  })
  const frame = activeFrame(state)
  if (frame) frame.savedRegisters[register.toUpperCase()] = value
  state.lastEffect = {
    kind: 'save-register',
    addresses: [address],
    value,
    register,
    label: `保存 ${register.toUpperCase()}`,
  }
  return address
}

export const popRegister = (
  state: SimulatorState,
  register: RegisterName,
): number => {
  const cell = findCell(state, state.esp)
  if (!cell || cell.value === null) {
    throw new Error(`栈顶 ${hexAddress(state.esp)} 没有可弹出的值`)
  }
  const value = cell.value
  state[register] = value
  releaseCell(state, state.esp)
  state.esp += CELL_SIZE
  const frame = activeFrame(state)
  if (frame) delete frame.savedRegisters[register.toUpperCase()]
  state.lastEffect = {
    kind: 'restore-register',
    addresses: [state.esp - CELL_SIZE],
    value,
    register,
    label: `恢复 ${register.toUpperCase()}`,
  }
  return value
}

export const pushEbp = (state: SimulatorState): number => {
  const frame = activeFrame(state)
  const frameId = frame?.id ?? null
  const address = pushValue(state, state.ebp, {
    type: 'saved-ebp',
    label: '保存的 EBP',
    frameId,
  })
  state.lastEffect = {
    kind: 'push',
    addresses: [address],
    value: state.ebp,
    label: 'old EBP',
  }
  return address
}

export const establishFrame = (state: SimulatorState): void => {
  const previousEbp = state.ebp
  state.ebp = state.esp
  const frame = activeFrame(state)
  if (frame) {
    frame.frameBase = state.ebp
    frame.entryEBP = state.ebp
    frame.status = 'active'
  }
  state.lastEffect = {
    kind: 'register',
    addresses: [state.ebp],
    register: 'ebp',
    from: previousEbp,
    to: state.ebp,
    label: 'EBP ← ESP',
  }
}

export const restoreEbp = (state: SimulatorState): number => {
  const cell = findCell(state, state.esp)
  if (!cell || cell.value === null) {
    throw new Error(`栈顶 ${hexAddress(state.esp)} 没有保存的 EBP`)
  }
  const value = cell.value
  state.ebp = value
  releaseCell(state, state.esp)
  state.esp += CELL_SIZE
  const frame = activeFrame(state)
  if (frame) frame.status = 'closing'
  state.lastEffect = {
    kind: 'pop',
    addresses: [state.esp - CELL_SIZE],
    value,
    register: 'ebp',
    label: 'EBP ← 保存值',
  }
  return value
}

export const releaseCell = (state: SimulatorState, address: number): void => {
  const cell = findCell(state, address)
  if (!cell) return
  updateCell(state, address, {
    isAllocated: false,
    isFreed: true,
    releasedFrameId: cell.frameId,
    isInitialized: cell.isInitialized,
  })
}

export const releaseAddresses = (
  state: SimulatorState,
  addresses: number[],
): void => {
  for (const address of addresses) releaseCell(state, address)
}

export const allocateStack = (
  state: SimulatorState,
  bytes: number,
  options: {
    context: ExecutionContext
    purpose: 'locals' | 'alignment'
    label: string
    effectLabel: string
  },
): number[] => {
  const oldEsp = state.esp
  const newEsp = oldEsp - bytes
  const addresses: number[] = []
  const frame = activeFrame(state)

  for (let address = oldEsp - CELL_SIZE; address >= newEsp; address -= CELL_SIZE) {
    const fill = options.context.debugFill
    updateCell(state, address, {
      value: fill ? DEBUG_FILL_CC : null,
      type: options.purpose === 'alignment' ? 'alignment' : 'local',
      label: options.label,
      frameId: frame?.id ?? null,
      isAllocated: true,
      isInitialized: false,
      isFreed: false,
      releasedFrameId: null,
      fillKind: fill ? 'cc' : null,
      variable: null,
      isAlignment: options.purpose === 'alignment',
    })
    addresses.push(address)
  }

  state.esp = newEsp
  state.lastEffect = {
    kind: options.context.debugFill ? 'fill' : 'allocate',
    addresses,
    value: options.context.debugFill ? '0xCCCCCCCC' : bytes,
    label: options.effectLabel,
  }
  return addresses
}

export const writeLocal = (
  state: SimulatorState,
  offset: number,
  value: number,
  variable: string,
): number => {
  const address = state.ebp + offset
  const frame = activeFrame(state)
  writeCell(state, address, {
    value,
    type: 'local',
    label: `${variable} = ${value}`,
    frameId: frame?.id ?? null,
    isAllocated: true,
    isInitialized: true,
    variable,
    fillKind: null,
    isFreed: false,
    releasedFrameId: null,
  })
  state.lastEffect = {
    kind: 'write',
    addresses: [address],
    value,
    label: `${variable} ← ${value}`,
  }
  return address
}

export const readMemory = (
  state: SimulatorState,
  base: 'ebp' | 'esp',
  offset: number,
): { address: number; value: number; cell: MemoryCell } => {
  const address = (base === 'ebp' ? state.ebp : state.esp) + offset
  const cell = findCell(state, address)
  if (!cell || cell.value === null) {
    return { address, value: 0, cell: cell ?? createEmptyCell(address) }
  }
  return { address, value: cell.value, cell }
}

export const callFunction = (
  state: SimulatorState,
  meta: {
    functionId: string
    name: string
    signature: string
    tone: FrameTone
    returnAddress: number
    returnTo: string
    argsBytes: number
    usesFramePointer?: boolean
  },
): StackFrame => {
  const caller = activeFrame(state)
  const callerId = caller?.id ?? null
  const calleeId = `${meta.functionId}@${state.executionHistory.length + 1}`

  if (caller) caller.status = 'waiting'

  // 参数由调用者压入；进入被调用函数后，它们归被调用函数栈帧所有。
  for (let address = state.esp; address < state.esp + meta.argsBytes; address += CELL_SIZE) {
    const cell = findCell(state, address)
    if (cell) {
      updateCell(state, address, {
        frameId: calleeId,
        type: 'parameter',
      })
    }
  }

  pushValue(state, meta.returnAddress, {
    type: 'return',
    label: '返回地址',
    frameId: calleeId,
  })

  const frame: StackFrame = {
    id: calleeId,
    functionId: meta.functionId,
    name: meta.name,
    signature: meta.signature,
    tone: meta.tone,
    entryESP: state.esp,
    currentESP: state.esp,
    entryEBP: state.ebp,
    frameBase: null,
    stackStart: state.esp,
    stackEnd: state.esp,
    size: CELL_SIZE,
    savedRegisters: {},
    returnAddress: meta.returnAddress,
    returnTo: meta.returnTo,
    callerId,
    status: meta.usesFramePointer === false ? 'active' : 'creating',
    argsBytes: meta.argsBytes,
  }

  state.callStack.push(frame)
  state.lastEffect = {
    kind: 'call',
    addresses: [state.esp],
    value: meta.returnAddress,
    label: `CALL → ${meta.name}`,
  }
  return frame
}

export const archiveTopFrame = (state: SimulatorState): StackFrame | undefined => {
  const frame = activeFrame(state)
  if (!frame) return undefined

  const addresses = state.memory
    .filter(
      (cell) =>
        cell.frameId === frame.id &&
        (cell.isAllocated || cell.isFreed || cell.releasedFrameId === frame.id),
    )
    .map((cell) => cell.address)

  if (addresses.length > 0) {
    frame.stackStart = Math.min(...addresses)
    frame.stackEnd = Math.max(...addresses)
    frame.size = frame.stackEnd - frame.stackStart + CELL_SIZE
  }

  const archived: StackFrame = {
    ...frame,
    status: 'returned',
    savedRegisters: { ...frame.savedRegisters },
  }

  state.callStack.pop()
  state.archivedFrames = [...state.archivedFrames.slice(-9), archived]
  const caller = activeFrame(state)
  if (caller) caller.status = 'active'
  return archived
}

export const executeRet = (state: SimulatorState): number => {
  const cell = findCell(state, state.esp)
  if (!cell || cell.value === null) {
    throw new Error(`RET 在 ${hexAddress(state.esp)} 没有找到返回地址`)
  }
  const returnAddress = cell.value
  const frame = activeFrame(state)
  releaseCell(state, state.esp)
  state.esp += CELL_SIZE
  if (frame?.functionId === 'main') {
    state.mainReturnValue = state.eax
  }
  archiveTopFrame(state)
  state.lastEffect = {
    kind: 'ret',
    addresses: [state.esp - CELL_SIZE],
    value: returnAddress,
    label: 'EIP ← 返回地址',
  }
  return returnAddress
}

export const releaseStackRange = (
  state: SimulatorState,
  bytes: number,
  effectLabel: string,
): number[] => {
  const addresses: number[] = []
  for (let index = 0; index < bytes / CELL_SIZE; index += 1) {
    const address = state.esp + index * CELL_SIZE
    releaseCell(state, address)
    addresses.push(address)
  }
  state.esp += bytes
  state.lastEffect = {
    kind: 'release',
    addresses,
    label: effectLabel,
  }
  return addresses
}

export const releaseToEbp = (state: SimulatorState): number[] => {
  const addresses: number[] = []
  for (let address = state.esp; address < state.ebp; address += CELL_SIZE) {
    releaseCell(state, address)
    addresses.push(address)
  }
  state.esp = state.ebp
  const frame = activeFrame(state)
  if (frame) frame.status = 'closing'
  state.lastEffect = {
    kind: 'release',
    addresses,
    label: '释放局部变量区',
  }
  return addresses
}

export const recomputeFrames = (state: SimulatorState): void => {
  state.callStack.forEach((frame, index) => {
    const isActive = index === state.callStack.length - 1
    if (isActive) {
      frame.currentESP = state.esp
      if (
        frame.status !== 'closing' &&
        (frame.frameBase !== null || frame.status === 'active')
      ) {
        frame.status = 'active'
      }
    } else if (frame.status !== 'closing') {
      frame.status = 'waiting'
    }

    const addresses = state.memory
      .filter((cell) => cell.frameId === frame.id && cell.isAllocated)
      .map((cell) => cell.address)

    if (addresses.length > 0) {
      frame.stackStart = Math.min(...addresses)
      frame.stackEnd = Math.max(...addresses)
      frame.size = frame.stackEnd - frame.stackStart + CELL_SIZE
    } else {
      frame.stackStart = frame.currentESP
      frame.stackEnd = frame.currentESP - CELL_SIZE
      frame.size = 0
    }
  })
}

export const terminateProcess = (
  state: SimulatorState,
  exitCode: number,
): void => {
  const frames = state.callStack.map((frame) => ({
    ...frame,
    status: 'returned' as const,
    savedRegisters: { ...frame.savedRegisters },
  }))
  state.archivedFrames = [...state.archivedFrames.slice(-9), ...frames]
  state.callStack = []

  for (const cell of state.memory) {
    if (cell.isAllocated) {
      cell.isAllocated = false
      cell.isFreed = true
      cell.releasedFrameId = cell.frameId
    }
  }
  state.processExitCode = exitCode
  state.lastEffect = {
    kind: 'exit',
    addresses: [],
    value: exitCode,
    label: `进程退出 · code ${exitCode}`,
  }
}

export const finalizeState = (state: SimulatorState): SimulatorState => {
  syncRegisters(state)
  recomputeFrames(state)
  return state
}

export interface RawFrameSetup {
  id: string
  functionId: string
  name: string
  signature: string
  tone: FrameTone
  entryESP: number
  currentESP: number
  entryEBP?: number | null
  frameBase?: number | null
  savedRegisters?: Record<string, number>
  returnAddress?: number | null
  returnTo?: string
  callerId?: string | null
  status?: StackFrame['status']
}

export const setupFrame = (seed: RawFrameSetup): StackFrame => ({
  id: seed.id,
  functionId: seed.functionId,
  name: seed.name,
  signature: seed.signature,
  tone: seed.tone,
  entryESP: seed.entryESP,
  currentESP: seed.currentESP,
  entryEBP: seed.entryEBP ?? null,
  frameBase: seed.frameBase ?? null,
  stackStart: seed.currentESP,
  stackEnd: seed.currentESP - CELL_SIZE,
  size: 0,
  savedRegisters: seed.savedRegisters ?? {},
  returnAddress: seed.returnAddress ?? null,
  returnTo: seed.returnTo ?? '程序结束',
  callerId: seed.callerId ?? null,
  status: seed.status ?? 'active',
})

export const clone = cloneState
