import { motion } from 'framer-motion'
import { Bug, Info, X } from 'lucide-react'
import type { MemoryCell, SimulatorState } from '../simulator/types'
import { hexAddress, hexWord } from '../simulator/utils'
import { memoryTypeMeta } from '../ui/meta'
import { frameForCell, frameLabel } from '../ui/stack'

interface CellInspectorProps {
  state: SimulatorState
  cell: MemoryCell
  onClose: () => void
}

/** 内存单元详情：动态栈与详细表格共用同一个组件，保证字段一致。 */
export const CellInspector = ({ state, cell, onClose }: CellInspectorProps) => {
  const frame = frameForCell(state, cell)
  const typeMeta = memoryTypeMeta[cell.type]
  const isFill = cell.isAllocated && cell.fillKind === 'cc'
  const status = cell.isAllocated
    ? cell.isInitialized
      ? '栈帧内有效数据'
      : '已预留 · 未初始化'
    : cell.isFreed
      ? '已释放 · 历史残留'
      : '空闲单元'
  const rows: [string, string][] = [
    ['地址', hexAddress(cell.address)],
    ['数值', cell.value === null ? '—' : `${hexWord(cell.value)} (${cell.value})`],
    ['大小', `${cell.size} bytes`],
    ['用途', cell.label],
    ['类型', typeMeta.label],
    ['所属函数', frame ? frameLabel(frame.name) : '—'],
    ['初始化', cell.isInitialized ? '已初始化' : '未初始化'],
    ['来源指令', cell.sourceInstruction ?? '—'],
    ['状态', status],
  ]

  return (
    <motion.div
      className="stack2-inspect"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
    >
      <button type="button" onClick={onClose} aria-label="关闭内存单元详情">
        <X size={12} />
      </button>
      <div className="stack2-inspect-title">
        {isFill ? <Bug size={11} /> : <Info size={11} />}
        内存单元 {hexAddress(cell.address)}
        {isFill && <span className="stack2-inspect-badge">DEBUG FILL</span>}
        {!cell.isAllocated && cell.isFreed && (
          <span className="stack2-inspect-badge" data-tone="freed">
            已释放
          </span>
        )}
      </div>
      <div className="stack2-inspect-grid">
        {rows.map(([key, value]) => (
          <div className="stack2-inspect-row" key={key}>
            <span>{key}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      {isFill && (
        <p className="stack2-inspect-note">
          0xCCCCCCCC 是 MSVC 调试运行库常见的未初始化栈填充模式，不是 GCC/Linux 的默认行为，也不是
          CPU 或 x86 ABI 的硬件规则。它由调试环境额外写入，真正执行 <code>mov [ebp−n], …</code>{' '}
          后才会被实际数值替换。
        </p>
      )}
      {frame && (
        <p className="stack2-inspect-note">
          所属帧 {frameLabel(frame.name)} 的范围 {hexAddress(frame.stackStart)}–
          {hexAddress(frame.stackEnd)} · {frame.size} B · 状态 {frame.status}
        </p>
      )}
    </motion.div>
  )
}
