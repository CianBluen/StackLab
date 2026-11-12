import type { MemoryCell, SimulatorState, StackFrame } from '../simulator/types'

/** 只在函数名是合法标识符时补 "()"；"初始栈" 这类区域名不加。 */
export const frameLabel = (name: string): string =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? `${name}()` : name

/** 地址在栈面板中的行号（0 = 栈顶地址所在行）。 */
export const rowIndexForAddress = (
  address: number,
  stackTop: number,
  cellSize = 4,
): number => Math.max(0, Math.round((stackTop - address) / cellSize))

export const frameForCell = (
  state: SimulatorState,
  cell: MemoryCell,
): StackFrame | null => {
  if (!cell.frameId) return null
  return (
    state.callStack.find((frame) => frame.id === cell.frameId) ??
    state.archivedFrames.find((frame) => frame.id === cell.frameId) ??
    null
  )
}

/** 对比两个快照，找出值 / 分配 / 初始化 / 填充 / 归属发生变化的地址。 */
export const changedAddresses = (
  state: SimulatorState,
  neighbor: SimulatorState | null,
): Set<number> => {
  const changed = new Set<number>()
  if (!neighbor) return changed
  for (const cell of state.memory) {
    const before = neighbor.memory.find((item) => item.address === cell.address)
    if (
      !before ||
      before.value !== cell.value ||
      before.isAllocated !== cell.isAllocated ||
      before.isInitialized !== cell.isInitialized ||
      before.fillKind !== cell.fillKind ||
      before.type !== cell.type ||
      before.label !== cell.label ||
      before.isFreed !== cell.isFreed
    ) {
      changed.add(cell.address)
    }
  }
  return changed
}
