export const CELL_SIZE = 4

export const DEFAULT_STACK_TOP = 0x1010
export const DEFAULT_STACK_BOTTOM = 0x0f60
export const DEBUG_FILL_CC = 0xcccccccc

export type RegisterName =
  | 'eax'
  | 'ebx'
  | 'ecx'
  | 'edx'
  | 'esi'
  | 'edi'
  | 'esp'
  | 'ebp'
  | 'eip'

export type FrameTone =
  | 'blue'
  | 'green'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'teal'
  | 'slate'

export type MemoryType =
  | 'free'
  | 'parameter'
  | 'return'
  | 'saved-ebp'
  | 'local'
  | 'saved-register'
  | 'caller'
  | 'startup'
  | 'argc'
  | 'argv'
  | 'envp'
  | 'auxv'
  | 'alignment'

export type MemoryFill = 'cc' | 'cd' | 'fe' | null

export type FrameStatus =
  | 'active'
  | 'waiting'
  | 'creating'
  | 'closing'
  | 'returned'

export interface MemoryCell {
  address: number
  value: number | null
  type: MemoryType
  label: string
  frameId: string | null
  isAllocated: boolean
  isInitialized: boolean
  isFreed?: boolean
  releasedFrameId?: string | null
  fillKind?: MemoryFill
  variable?: string | null
  isAlignment?: boolean
  /** 该单元的大小（字节）。当前模拟器一个栈单元固定为 4 B。 */
  size: number
  /** 哪一条指令产生/改变了这个单元，例如 "call main"。 */
  sourceInstruction: string | null
}

export interface StackFrame {
  id: string
  functionId: string
  name: string
  signature: string
  tone: FrameTone
  entryESP: number
  currentESP: number
  entryEBP: number | null
  frameBase: number | null
  stackStart: number
  stackEnd: number
  size: number
  savedRegisters: Record<string, number>
  returnAddress: number | null
  returnTo: string
  callerId: string | null
  status: FrameStatus
  argsBytes?: number
  /** 该帧被创建时所在的执行步号，用于教学提示“这是第几步的快照”。 */
  createdStep?: number
}

export type EffectKind =
  | 'push'
  | 'call'
  | 'pop'
  | 'ret'
  | 'allocate'
  | 'release'
  | 'write'
  | 'register'
  | 'compute'
  | 'save-register'
  | 'restore-register'
  | 'fill'
  | 'os'
  | 'lea'
  | 'exit'

export interface StepEffect {
  kind: EffectKind
  addresses: number[]
  value?: number | string
  label?: string
  register?: RegisterName
  from?: number
  to?: number
}

export interface SimulatorState {
  eax: number
  ebx: number
  ecx: number
  edx: number
  esi: number
  edi: number
  esp: number
  ebp: number
  eip: number
  memory: MemoryCell[]
  registers: Record<RegisterName, number>
  currentInstructionIndex: number
  executionHistory: string[]
  callStack: StackFrame[]
  archivedFrames: StackFrame[]
  stackTop: number
  stackBottom: number
  finished: boolean
  returnValue: number | null
  mainReturnValue: number | null
  processExitCode: number | null
  lastEffect: StepEffect | null
}

export interface ExecutionContext {
  debugFill: boolean
}

export interface AddressRef {
  base: 'ebp' | 'esp'
  offset: number
  kind: 'read' | 'write' | 'lea'
}

export interface Instruction {
  id: string
  address: number
  functionId: string
  functionName: string
  cLine: number | null
  assembly: string
  title: string
  explanation: string
  reason: string
  phase?: string
  /** 需要展示 [ebp−4] 这类有效地址计算时填写；UI 会按当前寄存器值实时换算。 */
  addressing?: AddressRef | null
  /** 内核装载、建立初始栈等系统动作，不是 CPU 执行的 x86 指令。 */
  isSystemAction?: boolean
  /** 函数序言 / 尾声这类编译器生成、不直接对应 C 语句的指令。 */
  isPrologue?: boolean
  execute: (state: SimulatorState, context: ExecutionContext) => SimulatorState
}

export interface TimelineEntry {
  state: SimulatorState
  instruction: Instruction | null
}

export type Direction = 'forward' | 'back' | 'reset'

export type PlaybackSpeed = 0.5 | 1 | 2

export interface CSourceLine {
  number: number
  text: string
  functionId: string | null
}

export interface CSourceFunction {
  id: string
  name: string
  signature: string
  startLine: number
  endLine: number
}

export interface CVariable {
  name: string
  functionId: string
  line: number
  typeLabel: string
  storage: 'stack' | 'register'
  base?: 'ebp' | 'esp'
  offset?: number
  register?: RegisterName
  note?: string
}

export interface CompilerProfile {
  kind: 'teaching' | 'reference'
  compiler: string
  options: string
  abi: string
  verified: boolean
  note: string
}

export interface ScenarioPhase {
  id: string
  label: string
  description: string
  color: string
  fromStep: number
  toStep: number
}

export interface CodeGroup {
  id: string
  name: string
  signature: string
  tone: FrameTone
  baseAddress: number
  instructions: Instruction[]
}

export interface Scenario {
  id: string
  title: string
  shortTitle: string
  subtitle: string
  description: string
  level: '入门' | '进阶' | '深入'
  tags: string[]
  learningPoints: string[]
  compiler: CompilerProfile
  cSource: {
    lines: CSourceLine[]
    functions: CSourceFunction[]
  }
  variables: CVariable[]
  codeGroups: CodeGroup[]
  instructions: Instruction[]
  initialState: (context?: Partial<ExecutionContext>) => SimulatorState
  stackTop: number
  stackBottom: number
  phases?: ScenarioPhase[]
  resultLabel: string
  endEip: number
}
