import type {
  CVariable,
  RegisterName,
  Scenario,
  SimulatorState,
  StackFrame,
} from '../simulator/types'
import { findCell, hexWord } from '../simulator/utils'

export type VariableAvailability =
  | 'memory'
  | 'register'
  | 'uninitialized'
  | 'out-of-scope'
  | 'freed'

export interface ResolvedVariable {
  variable: CVariable
  frame: StackFrame | null
  availability: VariableAvailability
  address: number | null
  register: RegisterName | null
  value: number | null
  valueText: string
  storageLabel: string
  detail: string
}

const frameForFunction = (
  state: SimulatorState,
  functionId: string,
): StackFrame | null => {
  for (let index = state.callStack.length - 1; index >= 0; index -= 1) {
    if (state.callStack[index].functionId === functionId) {
      return state.callStack[index]
    }
  }
  return null
}

export const formatVariableValue = (
  value: number | null,
  typeLabel: string,
): string => {
  if (value === null) return '—'
  if (typeLabel.includes('*')) return hexWord(value)
  return String(value)
}

export const resolveVariable = (
  state: SimulatorState,
  variable: CVariable,
): ResolvedVariable => {
  const frame = frameForFunction(state, variable.functionId)
  const storageLabel =
    variable.storage === 'register'
      ? `寄存器 ${variable.register?.toUpperCase() ?? '?'}`
      : `[${(variable.base ?? 'ebp').toUpperCase()}${
          (variable.offset ?? 0) >= 0 ? '+' : ''
        }${variable.offset ?? 0}]`

  if (!frame) {
    return {
      variable,
      frame: null,
      availability: 'out-of-scope',
      address: null,
      register: null,
      value: null,
      valueText: '—',
      storageLabel,
      detail: `${variable.functionId}() 当前不在调用栈中`,
    }
  }

  if (variable.storage === 'register' && variable.register) {
    const value = state.registers[variable.register]
    return {
      variable,
      frame,
      availability: 'register',
      address: null,
      register: variable.register,
      value,
      valueText: formatVariableValue(value, variable.typeLabel),
      storageLabel,
      detail: `${variable.note ?? '编译器优化为寄存器变量'}，没有栈地址`,
    }
  }

  const base = variable.base ?? 'ebp'
  if (base === 'ebp' && frame.frameBase === null) {
    return {
      variable,
      frame,
      availability: 'out-of-scope',
      address: null,
      register: null,
      value: null,
      valueText: '—',
      storageLabel,
      detail: '当前函数省略了 EBP 帧指针',
    }
  }

  const baseAddress =
    base === 'ebp'
      ? frame.frameBase ?? 0
      : frame.id === state.callStack[state.callStack.length - 1]?.id
        ? state.esp
        : frame.currentESP
  const address = baseAddress + (variable.offset ?? 0)
  const cell = findCell(state, address)

  if (!cell || cell.frameId !== frame.id) {
    return {
      variable,
      frame,
      availability: 'out-of-scope',
      address: null,
      register: null,
      value: null,
      valueText: '—',
      storageLabel,
      detail: '变量尚未分配，或所在栈帧已释放',
    }
  }

  if (!cell.isAllocated) {
    return {
      variable,
      frame,
      availability: 'freed',
      address,
      register: null,
      value: cell.value,
      valueText: formatVariableValue(cell.value, variable.typeLabel),
      storageLabel,
      detail: '栈帧已释放，当前看到的是历史残留数据',
    }
  }

  if (!cell.isInitialized) {
    return {
      variable,
      frame,
      availability: 'uninitialized',
      address,
      register: null,
      value: cell.value,
      valueText:
        cell.fillKind === 'cc' ? '0xCCCCCCCC' : '未初始化',
      storageLabel,
      detail:
        cell.fillKind === 'cc'
          ? 'Debug Fill 调试填充值，不是程序的业务数据'
          : 'sub esp 只预留空间，尚未写入变量',
    }
  }

  return {
    variable,
    frame,
    availability: 'memory',
    address,
    register: null,
    value: cell.value,
    valueText: formatVariableValue(cell.value, variable.typeLabel),
    storageLabel,
    detail: variable.note ?? `位于当前栈帧 ${storageLabel}`,
  }
}

export const resolveScenarioVariables = (
  state: SimulatorState,
  scenario: Scenario,
): ResolvedVariable[] =>
  scenario.variables.map((variable) => resolveVariable(state, variable))
