import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  Bug,
  Info,
  Layers3,
  X,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useSimulatorStore } from '../store/simulatorStore'
import {
  CELL_SIZE,
  type MemoryCell,
  type SimulatorState,
  type StackFrame,
  type StepEffect,
} from '../simulator/types'
import { hexAddress, hexWord } from '../simulator/utils'
import { frameToneMeta, memoryTypeMeta } from '../ui/meta'
import { PanelHeader } from './PanelHeader'

const ROW_HEIGHT = 40
const POINTER_HEIGHT = 26

const rowIndexForAddress = (address: number, stackTop: number): number =>
  Math.max(0, Math.round((stackTop - address) / CELL_SIZE))

const getChangedAddresses = (
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

const frameForCell = (
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

interface RowProps {
  cell: MemoryCell
  state: SimulatorState
  changed: boolean
  effect: StepEffect | null
  step: number
  focused: boolean
  setRowRef: (address: number, node: HTMLDivElement | null) => void
  onFillClick: (cell: MemoryCell) => void
}

const MemoryRow = ({
  cell,
  state,
  changed,
  effect,
  step,
  focused,
  setRowRef,
  onFillClick,
}: RowProps) => {
  const frame = frameForCell(state, cell)
  const typeMeta = memoryTypeMeta[cell.type]
  const tone = frame ? frameToneMeta[frame.tone] : null
  const isFill = cell.isAllocated && cell.fillKind === 'cc'
  const isResidual =
    !cell.isAllocated && cell.value !== null && cell.isFreed === true
  const isReleasedEmpty =
    !cell.isAllocated && cell.isFreed === true && cell.value === null
  const isEsp = state.callStack.some((item) => item.currentESP === cell.address)
  const isEbp = state.callStack.some((item) => item.frameBase === cell.address)
  const isEffectAddress = effect?.addresses.includes(cell.address) ?? false
  const flashTone = !changed
    ? null
    : !cell.isAllocated
      ? 'freed'
      : effect?.kind === 'write'
        ? 'write'
        : effect?.kind === 'fill'
          ? 'fill'
          : 'active'

  const style = {
    '--cell-type-color': typeMeta.color,
    '--frame-tone': tone?.color ?? '#6f839c',
  } as CSSProperties

  const handleClick = () => {
    if (isFill) onFillClick(cell)
  }

  return (
    <div
      ref={(node) => setRowRef(cell.address, node)}
      className="stack2-row"
      data-allocated={cell.isAllocated}
      data-freed={isResidual}
      data-fill={isFill}
      data-kind={cell.type}
      data-esp={isEsp}
      data-ebp={isEbp}
      data-effect={isEffectAddress}
      data-focused={focused}
      style={style}
      onClick={handleClick}
      title={`${hexAddress(cell.address)} · ${cell.label}${
        isFill ? ' · 点击查看 Debug Fill 说明' : ''
      }`}
    >
      <div aria-hidden="true" />

      {changed && flashTone && (
        <motion.div
          key={`${step}-${cell.address}`}
          className="stack2-flash"
          data-tone={flashTone}
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.05, delay: 0.16, ease: 'easeOut' }}
        />
      )}

      <div className="stack2-address">
        <span>{hexAddress(cell.address)}</span>
        {focused && <span className="stack2-focus-dot" />}
      </div>

      <div className="stack2-value">
        {isFill ? (
          <>
            <Bug size={10} className="shrink-0 text-[#ff9dbb]" />
            <span className="stack2-hex fill">{hexWord(cell.value ?? 0)}</span>
            <span className="stack2-fill-tag">DEBUG FILL</span>
          </>
        ) : isResidual ? (
          <>
            <span className="stack2-hex residual">{hexWord(cell.value ?? 0)}</span>
            <span className="stack2-residual-tag">
              {cell.fillKind === 'cc' ? '已释放 · 填充残留' : '已释放 · 残留'}
            </span>
            <span className="stack2-annotation">{cell.label}</span>
          </>
        ) : isReleasedEmpty ? (
          <span className="stack2-free">已释放 · 空</span>
        ) : cell.isAllocated && cell.isInitialized && cell.value !== null ? (
          <>
            <span className="stack2-valid-dot" />
            <span className="stack2-hex">{hexWord(cell.value)}</span>
            <span className="stack2-annotation">{cell.label}</span>
          </>
        ) : cell.isAllocated ? (
          <>
            <span className="stack2-uninit">已预留 · 未初始化</span>
            <span className="stack2-annotation">{cell.label}</span>
          </>
        ) : (
          <span className="stack2-free">— 空闲</span>
        )}
      </div>

      <div className="stack2-type">
        {cell.type !== 'free' ? (
          <span className="stack2-type-chip" data-freed={isResidual}>
            {typeMeta.label}
          </span>
        ) : (
          <span className="text-[8px] text-[#37485e]">—</span>
        )}
      </div>

      <div className="stack2-frame">
        {frame ? (
          <span className="stack2-frame-chip" data-tone={frame.tone}>
            <span className="stack2-frame-dot" />
            {frame.name}
          </span>
        ) : (
          <span className="text-[8px] text-[#324257]">—</span>
        )}
      </div>

      <div aria-hidden="true" />
    </div>
  )
}

interface PointerMarker {
  key: string
  frame: StackFrame
  side: 'esp' | 'ebp'
  address: number
  y: number
  current: boolean
}

const PointerChip = ({
  marker,
  color,
}: {
  marker: PointerMarker
  color: string
}) => (
  <motion.div
    className="stack2-pointer"
    data-side={marker.side}
    data-current={marker.current}
    style={{ '--ptr-color': color } as CSSProperties}
    initial={false}
    animate={{ y: marker.y }}
    transition={{ type: 'spring', stiffness: 270, damping: 30, mass: 0.72 }}
    title={`${marker.frame.name}() 的 ${marker.side.toUpperCase()} 历史快照：${hexAddress(marker.address)}`}
  >
    <span className="stack2-pointer-frame">{marker.frame.name}()</span>
    <span className="stack2-pointer-name">{marker.side.toUpperCase()}</span>
    <span className="stack2-pointer-value">{hexAddress(marker.address)}</span>
    <span className="stack2-pointer-arrow" />
  </motion.div>
)

const TransferToken = ({
  effect,
  step,
  stackTop,
}: {
  effect: StepEffect | null
  step: number
  stackTop: number
}) => {
  if (!effect || effect.addresses.length === 0) return null
  if (
    !['push', 'call', 'write', 'pop', 'ret', 'release', 'fill', 'allocate'].includes(
      effect.kind,
    )
  ) {
    return null
  }
  if (effect.kind === 'release' && effect.addresses.length > 1) return null

  const address = effect.addresses[0]
  const targetY = rowIndexForAddress(address, stackTop) * ROW_HEIGHT + 7
  const downward = ['push', 'call', 'write', 'fill', 'allocate'].includes(
    effect.kind,
  )
  const startY = targetY + (downward ? -43 : 38)
  const endY = targetY + (downward ? 7 : -39)

  return (
    <motion.div
      key={`${step}-${effect.kind}-${address}`}
      className="stack2-token"
      data-kind={effect.kind}
      initial={{ y: startY, opacity: 0, scale: 0.92 }}
      animate={{
        y: [startY, startY, endY, endY],
        opacity: [0, 1, 1, 0],
        scale: [0.92, 1, 1, 0.96],
      }}
      transition={{ duration: 0.6, times: [0, 0.16, 0.82, 1], ease: 'easeInOut' }}
    >
      <span>{downward ? '↓' : '↑'}</span>
      <span>{effect.label ?? effect.value}</span>
    </motion.div>
  )
}

const FrameBox = ({
  frame,
  state,
  ghost,
}: {
  frame: StackFrame
  state: SimulatorState
  ghost?: boolean
}) => {
  if (frame.size <= 0) return null
  const topIndex = rowIndexForAddress(frame.stackEnd, state.stackTop)
  const bottomIndex = rowIndexForAddress(frame.stackStart, state.stackTop)
  const top = topIndex * ROW_HEIGHT + 1
  const height = Math.max(ROW_HEIGHT - 2, (bottomIndex - topIndex + 1) * ROW_HEIGHT - 2)
  const tone = frameToneMeta[frame.tone]
  const saved = Object.keys(frame.savedRegisters)
  const current = state.callStack[state.callStack.length - 1]?.id === frame.id

  return (
    <motion.div
      className="stack2-frame-box"
      data-ghost={ghost}
      data-current={current && !ghost}
      style={
        {
          '--box-color': tone.color,
          '--box-soft': tone.soft,
        } as CSSProperties
      }
      initial={{ opacity: 0, top, height, scaleY: 0.96 }}
      animate={{ opacity: 1, top, height, scaleY: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 28 }}
    >
      <div className="stack2-frame-label">
        <span className="stack2-frame-label-name">
          {frame.name}()
          {ghost && <em>已释放</em>}
        </span>
        <span className="stack2-frame-label-range">
          {hexAddress(frame.stackStart)}–{hexAddress(frame.stackEnd)} · {frame.size} B
        </span>
        {!ghost && saved.length > 0 && (
          <span className="stack2-frame-label-saved">
            saved {saved.join(' / ')}
          </span>
        )}
      </div>
    </motion.div>
  )
}

export const StackMemory = () => {
  const scenario = useSimulatorStore((state) => state.scenario)
  const currentStep = useSimulatorStore((state) => state.currentStep)
  const direction = useSimulatorStore((state) => state.direction)
  const totalSteps = useSimulatorStore((state) => state.totalSteps)
  const timeline = useSimulatorStore((state) => state.timeline)
  const state = useSimulatorStore(
    (store) => store.timeline[store.currentStep].state,
  )
  const focusAddress = useSimulatorStore((store) => store.focusAddress)
  const focusLabel = useSimulatorStore((store) => store.focusLabel)
  const [fillNote, setFillNote] = useState<MemoryCell | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const previous = currentStep > 0 ? timeline[currentStep - 1].state : null
  const animationNeighbor =
    direction === 'back' && currentStep < totalSteps
      ? timeline[currentStep + 1].state
      : previous
  const changed = getChangedAddresses(state, animationNeighbor)
  const effect = state.lastEffect

  const activeFrames = state.callStack.filter((frame) => frame.size > 0)
  const ghostFrames = state.archivedFrames
    .filter((frame) =>
      state.memory.some((cell) => cell.releasedFrameId === frame.id),
    )
    .slice(-4)

  const espMarkers: PointerMarker[] = []
  const ebpMarkers: PointerMarker[] = []
  state.callStack.forEach((frame, index) => {
    if (frame.functionId === 'kernel') return
    const current =
      index === state.callStack.length - 1 && frame.status !== 'closing'
    const espY =
      rowIndexForAddress(frame.currentESP, state.stackTop) * ROW_HEIGHT +
      (ROW_HEIGHT - POINTER_HEIGHT) / 2
    espMarkers.push({
      key: `${frame.id}-esp`,
      frame,
      side: 'esp',
      address: frame.currentESP,
      y: espY,
      current,
    })
    if (frame.frameBase !== null) {
      const ebpY =
        rowIndexForAddress(frame.frameBase, state.stackTop) * ROW_HEIGHT +
        (ROW_HEIGHT - POINTER_HEIGHT) / 2
      ebpMarkers.push({
        key: `${frame.id}-ebp`,
        frame,
        side: 'ebp',
        address: frame.frameBase,
        y: ebpY,
        current,
      })
    }
  })

  const allocatedCount = state.memory.filter((cell) => cell.isAllocated).length
  const freedCount = state.memory.filter(
    (cell) => !cell.isAllocated && cell.value !== null,
  ).length
  const fillCount = state.memory.filter(
    (cell) => cell.isAllocated && cell.fillKind === 'cc',
  ).length

  const setRowRef = (address: number, node: HTMLDivElement | null) => {
    rowRefs.current[address] = node
  }

  const scrollToAddress = (address: number, padding = 46) => {
    const container = scrollRef.current
    const row = rowRefs.current[address]
    if (!container || !row) return
    const rowTop = row.offsetTop
    const rowBottom = rowTop + ROW_HEIGHT
    const viewTop = container.scrollTop
    const viewBottom = viewTop + container.clientHeight
    if (rowTop < viewTop + 8) {
      container.scrollTo({ top: Math.max(0, rowTop - padding), behavior: 'smooth' })
    } else if (rowBottom > viewBottom - 8) {
      container.scrollTo({
        top: rowBottom - container.clientHeight + padding,
        behavior: 'smooth',
      })
    }
  }

  useEffect(() => {
    scrollToAddress(state.esp)
  }, [currentStep, state.esp])

  useEffect(() => {
    if (focusAddress !== null) {
      scrollToAddress(focusAddress, 80)
    }
  }, [focusAddress])

  useEffect(() => {
    setFillNote(null)
  }, [currentStep, scenario.id])

  const legendTypes = [
    'parameter',
    'return',
    'saved-ebp',
    'local',
    'saved-register',
    'alignment',
    'caller',
  ] as const

  return (
    <section className="panel stack-panel stack2-panel" aria-label="栈内存可视化">
      <PanelHeader
        icon={Layers3}
        title="栈内存"
        subtitle="Stack · frames / snapshots"
        right={
          <div className="stack-header-right">
            <div className="stack-direction" title="x86 栈向低地址方向增长">
              <span>高地址</span>
              <ArrowDown size={11} strokeWidth={2.2} />
              <strong>低地址</strong>
            </div>
            <span className="panel-meta">{state.callStack.length} frames</span>
          </div>
        }
      />

      <div className="stack2-columns">
        <div className="stack2-col-esp">ESP 快照</div>
        <div>地址</div>
        <div>内容 · 值</div>
        <div className="stack2-col-type">类型</div>
        <div className="stack2-col-frame">帧</div>
        <div className="stack2-col-ebp">EBP 快照</div>
      </div>

      <div className="stack2-frame-ribbon" aria-label="活动栈帧范围">
        {state.callStack.length === 0 ? (
          <span className="stack2-frame-ribbon-empty">无活动栈帧 · 程序已结束</span>
        ) : (
          state.callStack.map((frame, index) => {
            const tone = frameToneMeta[frame.tone]
            return (
              <span
                className="stack2-frame-ribbon-chip"
                data-current={index === state.callStack.length - 1}
                key={frame.id}
                style={{ '--frame-color': tone.color } as CSSProperties}
                title={`${frame.name}() 栈帧 · EBP ${
                  frame.frameBase === null ? '未建立' : hexAddress(frame.frameBase)
                } · ESP ${hexAddress(frame.currentESP)}`}
              >
                <span className="stack2-frame-ribbon-dot" />
                <b>{frame.name}()</b>
                {frame.size > 0 ? (
                  <>
                    <span>
                      {hexAddress(frame.stackStart)}–{hexAddress(frame.stackEnd)}
                    </span>
                    <em>{frame.size} B</em>
                  </>
                ) : (
                  <span>尚未占用栈空间</span>
                )}
              </span>
            )
          })
        )}
      </div>

      <div className="stack-scroll stack2-scroll" ref={scrollRef}>
        <div className="stack2-surface">
          {ghostFrames.map((frame) => (
            <FrameBox key={`ghost-${frame.id}`} frame={frame} state={state} ghost />
          ))}
          {activeFrames.map((frame) => (
            <FrameBox key={frame.id} frame={frame} state={state} />
          ))}

          {state.memory.map((cell) => (
            <MemoryRow
              key={cell.address}
              cell={cell}
              state={state}
              changed={changed.has(cell.address) && direction !== 'reset'}
              effect={effect}
              step={currentStep}
              focused={focusAddress === cell.address}
              setRowRef={setRowRef}
              onFillClick={(target) => setFillNote(target)}
            />
          ))}

          <div className="stack2-end">
            <ArrowDown size={9} />
            {hexAddress(state.stackBottom)} · 栈底边界
          </div>

          <div className="stack2-lane stack2-lane-esp" aria-label="各函数 ESP 历史快照">
            <AnimatePresence>
              {espMarkers.map((marker) => (
                <PointerChip key={marker.key} marker={marker} color="#4d9dff" />
              ))}
            </AnimatePresence>
          </div>
          <div className="stack2-lane stack2-lane-ebp" aria-label="各函数 EBP 历史快照">
            <AnimatePresence>
              {ebpMarkers.map((marker) => (
                <PointerChip key={marker.key} marker={marker} color="#37d99b" />
              ))}
            </AnimatePresence>
          </div>

          {direction === 'forward' && (
            <TransferToken effect={effect} step={currentStep} stackTop={state.stackTop} />
          )}
        </div>
      </div>

      <div className="stack2-snapshot-note">
        <Info size={10} />
        <span>
          多个 <b>ESP / EBP</b> 是各函数暂停时的教学快照；真实 CPU 只有一个物理 ESP 和一个 EBP。
        </span>
        {focusLabel && (
          <span className="stack2-focus-label">
            定位：<b>{focusLabel}</b>
          </span>
        )}
      </div>

      <AnimatePresence>
        {fillNote && (
          <motion.div
            className="stack2-fill-note"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <button type="button" onClick={() => setFillNote(null)} aria-label="关闭说明">
              <X size={12} />
            </button>
            <div className="stack2-fill-note-title">
              <Bug size={11} />
              0xCCCCCCCC · Debug Stack Fill
            </div>
            <p>
              {hexAddress(fillNote.address)} 在 <code>sub esp</code> 时被预留，但程序还没有写入它。
              0xCCCCCCCC 是 MSVC 调试运行库常见的未初始化栈填充值，不是 CPU 或 x86 ABI 的硬件规则。
              当程序真正执行 <code>mov [ebp−n], ...</code> 时，该单元才会变成变量数据。
            </p>
            <p className="text-[8.5px] text-[#627991]">
              其他调试器/分配器可能使用 0xCDCDCDCD、0xFEEEFEEE 等不同填充值。
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="stack2-footer">
        <div className="legend" aria-label="内存单元类型图例">
          {legendTypes.map((type) => {
            const meta = memoryTypeMeta[type]
            return (
              <span className="legend-item" key={type}>
                <span
                  className="legend-dot"
                  style={{ '--legend-color': meta.color } as CSSProperties}
                />
                {meta.label}
              </span>
            )
          })}
          {scenario.variables.some((variable) => variable.storage === 'register') && (
            <span className="legend-item legend-register">
              <span className="legend-dot" style={{ '--legend-color': '#d7c36a' } as CSSProperties} />
              寄存器变量不在栈中
            </span>
          )}
        </div>
        <div className="stack-status">
          <span>
            有效 <b>{allocatedCount}</b>
          </span>
          <span className="status-sep" />
          <span>
            残留 <b>{freedCount}</b>
          </span>
          <span className="status-sep" />
          <span>
            Fill <b>{fillCount}</b>
          </span>
        </div>
      </div>
    </section>
  )
}
