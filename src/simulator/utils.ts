import {
  CELL_SIZE,
  type MemoryCell,
  type RegisterName,
  type SimulatorState,
} from './types'

export const hex = (value: number, digits = 8): string =>
  `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`

export const hexAddress = (value: number): string => hex(value, 4)

export const hexWord = (value: number): string => hex(value, 8)

export const decimal = (value: number): string => value.toLocaleString('zh-CN')

export const formatDelta = (delta: number): string =>
  delta > 0 ? `+${delta}` : `${delta}`

export const findCell = (
  state: SimulatorState,
  address: number,
): MemoryCell | undefined => state.memory.find((cell) => cell.address === address)

export const cloneState = (state: SimulatorState): SimulatorState => ({
  ...state,
  memory: state.memory.map((cell) => ({ ...cell })),
  registers: { ...state.registers },
  executionHistory: [...state.executionHistory],
  callStack: state.callStack.map((frame) => ({
    ...frame,
    savedRegisters: { ...frame.savedRegisters },
  })),
  archivedFrames: state.archivedFrames.map((frame) => ({
    ...frame,
    savedRegisters: { ...frame.savedRegisters },
  })),
  lastEffect: null,
})

export const updateCell = (
  state: SimulatorState,
  address: number,
  patch: Partial<MemoryCell>,
): void => {
  const cell = state.memory.find((candidate) => candidate.address === address)
  if (cell) Object.assign(cell, patch)
}

export const freeCell = (state: SimulatorState, address: number): void => {
  updateCell(state, address, {
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
    size: CELL_SIZE,
    sourceInstruction: null,
  })
}

/**
 * 把“哪条指令写了这块内存”记到单元上，供单元格详情与悬停提示使用。
 * 只有真正写内存的指令才应调用它，读取类指令不会覆盖数据来源。
 */
export const stampSource = (
  state: SimulatorState,
  addresses: number[],
  assembly: string,
): void => {
  for (const address of addresses) {
    const cell = state.memory.find((candidate) => candidate.address === address)
    if (cell) {
      cell.sourceInstruction = assembly
      cell.size = CELL_SIZE
    }
  }
}

export const syncRegisters = (state: SimulatorState): void => {
  state.registers = {
    eax: state.eax,
    ebx: state.ebx,
    ecx: state.ecx,
    edx: state.edx,
    esi: state.esi,
    edi: state.edi,
    esp: state.esp,
    ebp: state.ebp,
    eip: state.eip,
  }
}

const REGISTER_TOKENS: RegisterName[] = [
  'eax',
  'ebx',
  'ecx',
  'edx',
  'esi',
  'edi',
  'esp',
  'ebp',
  'eip',
]

const templateValues = (
  before: SimulatorState,
  after: SimulatorState,
): Record<string, string> => {
  const values: Record<string, string> = {
    espB: hexAddress(before.esp),
    espA: hexAddress(after.esp),
    ebpB: hexAddress(before.ebp),
    ebpA: hexAddress(after.ebp),
    eipB: hex(before.eip),
    eipA: hex(after.eip),
    espBDec: String(before.esp),
    espADec: String(after.esp),
    ebpBDec: String(before.ebp),
    ebpADec: String(after.ebp),
  }

  for (const register of REGISTER_TOKENS) {
    values[`${register}B`] = String(before[register])
    values[`${register}A`] = String(after[register])
    values[`${register}BHex`] = hex(before[register])
    values[`${register}AHex`] = hex(after[register])
  }

  // 地址和指针寄存器默认用十六进制显示；数值寄存器保留十进制代币。
  values.espB = hexAddress(before.esp)
  values.espA = hexAddress(after.esp)
  values.ebpB = hexAddress(before.ebp)
  values.ebpA = hexAddress(after.ebp)
  values.eipB = hex(before.eip)
  values.eipA = hex(after.eip)

  return values
}

export const renderTemplate = (
  template: string,
  before: SimulatorState,
  after: SimulatorState,
): string => {
  const values = templateValues(before, after)
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (match, key: string) => {
    return values[key] ?? match
  })
}
