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
