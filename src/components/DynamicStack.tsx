import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  Crosshair,
  Layers3,
  LocateFixed,
  Rows3,
  StretchVertical,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useSimulatorStore } from '../store/simulatorStore'
import type { MemoryCell, SimulatorState } from '../simulator/types'
import { hexAddress, hexWord } from '../simulator/utils'
import { frameToneMeta, memoryTypeMeta } from '../ui/meta'
import {
  changedAddresses,
  frameForCell,
  frameLabel,
  rowIndexForAddress,
} from '../ui/stack'
import { CellInspector } from './CellInspector'
import { PanelHeader } from './PanelHeader'

type Density = 'cozy' | 'compact'

/** 单格高度（含 1px 分隔线）。格子连续排列，没有间距。 */
const CELL_HEIGHT: Record<Density, number> = { cozy: 64, compact: 50 }
/** 容器顶部留白：给最上方帧标签留位置，同时让第一格从统一坐标系开始。 */
const PAD_TOP = 24
const PAD_BOTTOM = 16
const CHIP_H = 28
const SPRING = { type: 'spring', stiffness: 380, damping: 34, mass: 0.62 } as const

const cellState = (cell: MemoryCell): 'free' | 'reserved' | 'valid' | 'residual' => {
  if (!cell.isAllocated) {
    return cell.isFreed && cell.value !== null ? 'residual' : 'free'
  }
  if (!cell.isInitialized) return 'reserved'
  return 'valid'
}

const STATE_LABEL: Record<'free' | 'reserved' | 'valid' | 'residual', string> = {
  free: '空闲',
  reserved: '未初始化',
  valid: '有效',
  residual: '已释放',
}

const rowValue = (cell: MemoryCell): string =>
  cell.value === null ? '—' : hexWord(cell.value)

export const DynamicStack = () => {
  const scenario = useSimulatorStore((store) => store.scenario)
  const currentStep = useSimulatorStore((store) => store.currentStep)
  const totalSteps = useSimulatorStore((store) => store.totalSteps)
  const direction = useSimulatorStore((store) => store.direction)
  const timeline = useSimulatorStore((store) => store.timeline)
  const state: SimulatorState = useSimulatorStore(
    (store) => store.timeline[store.currentStep].state,
  )
  const focusAddress = useSimulatorStore((store) => store.focusAddress)
  const focusRegister = useSimulatorStore((store) => store.focusRegister)
  const focusLabel = useSimulatorStore((store) => store.focusLabel)
  const focusVariable = useSimulatorStore((store) => store.focusVariable)

  const [density, setDensity] = useState<Density>('cozy')
  const [follow, setFollow] = useState(true)
  const [inspect, setInspect] = useState<MemoryCell | null>(null)
  const [hover, setHover] = useState<MemoryCell | null>(null)
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const firstScrollRef = useRef(true)

  /**
   * 唯一的坐标系：第 i 个内存格占 [PAD_TOP + i*cellH, PAD_TOP + (i+1)*cellH]。
   * 内存格、帧框、指针、滚动锚点全部用它，避免“卡片带 margin 但帧框按行高算”的错位。
   */
  const cellH = CELL_HEIGHT[density]
  const rowTop = (index: number): number => PAD_TOP + index * cellH

  // 切换密度时几何整体变化：这一帧不要做弹簧动画，否则帧框会短暂落后于格子。
  const prevCellH = useRef(cellH)
  const snapGeometry = prevCellH.current !== cellH
  useEffect(() => {
    prevCellH.current = cellH
  }, [cellH])
  const geometryTransition = snapGeometry ? { duration: 0 } : SPRING

  const activeFrames = state.callStack.filter((frame) => frame.size > 0)
  const currentFrame = state.callStack[state.callStack.length - 1] ?? null
  const selectedFrame =
    activeFrames.find((frame) => frame.id === selectedFrameId) ?? null

  const espRow = rowIndexForAddress(state.esp, state.stackTop)
  const hasEbp = state.ebp !== 0
  const ebpInside =
    hasEbp && state.ebp >= state.stackBottom && state.ebp <= state.stackTop
  const ebpRow = ebpInside ? rowIndexForAddress(state.ebp, state.stackTop) : 0
  const highlightedAddress =
    focusAddress ??
    (focusRegister === 'esp'
      ? state.esp
      : focusRegister === 'ebp' && hasEbp
        ? state.ebp
        : null)

  const neighbor =
    direction === 'back' && currentStep < totalSteps
      ? timeline[currentStep + 1].state
      : currentStep > 0
        ? timeline[currentStep - 1].state
        : null
  const changed = useMemo(() => changedAddresses(state, neighbor), [state, neighbor])

  const effect = state.lastEffect
  const enterAddress =
    direction === 'forward' && effect && ['push', 'call', 'os'].includes(effect.kind)
      ? effect.addresses[0]
      : null
  const leaveAddress =
    direction === 'forward' && effect && ['pop', 'ret'].includes(effect.kind)
      ? effect.addresses[0]
      : null
  const tokenAddress =
    direction === 'forward' && effect
      ? ['push', 'call', 'pop', 'ret'].includes(effect.kind)
        ? effect.addresses[0]
        : null
      : null
  const tokenDown =
    effect?.kind === 'push' || effect?.kind === 'call' || effect?.kind === 'os'

  const ghostFrames = state.archivedFrames
    .filter((frame) => state.memory.some((cell) => cell.releasedFrameId === frame.id))
    .slice(-2)

  const wellHeight = PAD_TOP + state.memory.length * cellH + PAD_BOTTOM

  /* ---------------- 滚动 ---------------- */

  /** 对齐到格子边界，避免顶部出现半格。 */
  const alignScrollTop = (raw: number): number =>
    Math.max(0, PAD_TOP + Math.round((raw - PAD_TOP) / cellH) * cellH)

  useEffect(() => {
    if (!follow) return
    const container = scrollRef.current
    if (!container) return
    const top = rowTop(espRow)
    const viewTop = container.scrollTop
    const viewBottom = viewTop + container.clientHeight
    if (top < viewTop + 16 || top + cellH > viewBottom - 16) {
      container.scrollTo({
        top: alignScrollTop(top - container.clientHeight * 0.5),
        behavior: firstScrollRef.current ? 'auto' : 'smooth',
      })
    }
    firstScrollRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, state.esp, cellH, follow])

  const scrollToRow = (index: number, behavior: ScrollBehavior = 'smooth') => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTo({
      top: alignScrollTop(rowTop(index) - container.clientHeight / 2 + cellH / 2),
      behavior,
    })
  }

  useEffect(() => {
    if (focusAddress === null) return
    scrollToRow(rowIndexForAddress(focusAddress, state.stackTop))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAddress, cellH])

  useEffect(() => {
    if (focusRegister !== 'esp' && focusRegister !== 'ebp') return
    if (focusRegister === 'ebp' && !ebpInside) return
    scrollToRow(focusRegister === 'esp' ? espRow : ebpRow)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRegister])

  useEffect(() => {
    setInspect(null)
    setHover(null)
    setSelectedFrameId(null)
  }, [currentStep, scenario.id])

  const fitToFrames = () => {
    const container = scrollRef.current
    if (!container) return
    if (activeFrames.length === 0) {
      scrollToRow(espRow)
      return
    }
    const topRow = Math.min(
      ...activeFrames.map((frame) => rowIndexForAddress(frame.stackEnd, state.stackTop)),
    )
    const bottomRow = Math.max(
      ...activeFrames.map((frame) => rowIndexForAddress(frame.stackStart, state.stackTop)),
    )
    const center = (rowTop(topRow) + rowTop(bottomRow) + cellH) / 2
    container.scrollTo({
      top: Math.max(0, center - container.clientHeight / 2),
      behavior: 'smooth',
    })
  }

  const focusCell = (cell: MemoryCell) => {
    focusVariable({
      address: cell.address,
      label: `${hexAddress(cell.address)} · ${cell.label}`,
    })
    setInspect(cell)
  }

  const statusCell = inspect ?? hover

  return (
    <section className="panel dyn-panel" aria-label="动态栈内存可视化">
      <PanelHeader
        icon={Layers3}
        title="动态栈内存"
        subtitle="Live stack · push / pop"
        right={
          <div className="dyn-header-right">
            <span className="dyn-hw-note" title="真实 CPU 只有一组 ESP/EBP">
              1 ESP · 1 EBP
            </span>
            <button
              type="button"
              className="dyn-icon-btn"
              data-active={follow}
              onClick={() => setFollow((value) => !value)}
              title="跟随 ESP 自动滚动"
            >
              <LocateFixed size={11} />
            </button>
            <button
              type="button"
              className="dyn-icon-btn"
              data-active={density === 'compact'}
              onClick={() =>
                setDensity((value) => (value === 'cozy' ? 'compact' : 'cozy'))
              }
              title={density === 'cozy' ? '切换到紧凑格子' : '切换到舒适格子'}
            >
              {density === 'cozy' ? <Rows3 size={11} /> : <StretchVertical size={11} />}
            </button>
            <button
              type="button"
              className="dyn-icon-btn"
              onClick={fitToFrames}
              title="适应当前活动栈帧"
            >
              <Crosshair size={11} />
            </button>
          </div>
        }
      />

      <div className="dyn-direction">
        <ArrowDown size={10} />
        高地址在上 · 栈向低地址增长
        <span className="dyn-step-note">
          {String(currentStep).padStart(2, '0')} / {totalSteps}
        </span>
      </div>

      <div className="dyn-frames-strip" aria-label="活动栈帧">
        {activeFrames.length === 0 ? (
          <span className="dyn-frames-empty">无活动栈帧</span>
        ) : (
          activeFrames.map((frame) => (
            <button
              key={frame.id}
              type="button"
              className="dyn-frames-chip"
              data-current={currentFrame?.id === frame.id}
              data-selected={selectedFrameId === frame.id}
              style={
                { '--frame-color': frameToneMeta[frame.tone].color } as CSSProperties
              }
              onClick={() => {
                setSelectedFrameId(frame.id)
                focusVariable({
                  address: frame.frameBase ?? frame.stackEnd,
                  label: `${frameLabel(frame.name)} 栈帧 · ${hexAddress(frame.stackStart)}–${hexAddress(frame.stackEnd)} · ${frame.size} B`,
                })
              }}
              title={`${frameLabel(frame.name)} ${hexAddress(frame.stackStart)}–${hexAddress(frame.stackEnd)} · ${frame.size} B`}
            >
              <span className="dyn-frames-dot" />
              <b>{frameLabel(frame.name)}</b>
              <span className="dyn-frames-range">
                {hexAddress(frame.stackStart)}–{hexAddress(frame.stackEnd)}
              </span>
              <em>{frame.size} B</em>
            </button>
          ))
        )}
      </div>

      <div className="dyn-scroll" ref={scrollRef} onDoubleClick={fitToFrames}>
        <div className="dyn-stage">
          <div className="dyn-cap" data-edge="high">
            <span>高地址</span>
            <b>{hexAddress(state.stackTop)}</b>
          </div>

          <div
            className="dyn-well"
            data-density={density}
            style={
              {
                height: wellHeight,
                paddingTop: PAD_TOP,
                paddingBottom: PAD_BOTTOM,
              } as CSSProperties
            }
          >
            <div className="dyn-cells">
              {state.memory.map((cell) => {
                const isFill = cell.isAllocated && cell.fillKind === 'cc'
                const kind = cellState(cell)
                const frame = frameForCell(state, cell)
                const typeMeta = memoryTypeMeta[cell.type]
                const isEsp = cell.address === state.esp
                const isEbp = hasEbp && cell.address === state.ebp
                const focused = highlightedAddress === cell.address
                return (
                  <div
                    key={cell.address}
                    className="dyn-cell"
                    data-kind={cell.type}
                    data-state={kind}
                    data-fill={isFill}
                    data-esp={isEsp}
                    data-ebp={isEbp}
                    data-focus={focused}
                    data-entering={cell.address === enterAddress}
                    data-leaving={cell.address === leaveAddress}
                    style={
                      {
                        height: cellH,
                        '--type-color': typeMeta.color,
                      } as CSSProperties
                    }
                    onClick={() => focusCell(cell)}
                    onMouseEnter={() => setHover(cell)}
                    onMouseLeave={() => setHover(null)}
                    title={`${hexAddress(cell.address)} · ${cell.label}${
                      cell.sourceInstruction ? ` · 来源：${cell.sourceInstruction}` : ''
                    }`}
                  >
                    <div className="dyn-cell-head">
                      <span className="dyn-cell-addr">{hexAddress(cell.address)}</span>
                      <span className="dyn-cell-value" data-fill={isFill}>
                        {isFill ? (
                          <>
                            <i>CC</i>
                            {hexWord(cell.value ?? 0)}
                          </>
                        ) : (
                          rowValue(cell)
                        )}
                      </span>
                    </div>
                    <div className="dyn-cell-body">
                      <span className="dyn-cell-label">{cell.label}</span>
                      <span className="dyn-cell-state" data-state={kind}>
                        {isFill ? 'DEBUG FILL' : STATE_LABEL[kind]}
                      </span>
                    </div>
                    <div className="dyn-cell-meta">
                      {kind === 'free' ? (
                        <>
                          未使用 <i>·</i> {cell.size} B
                        </>
                      ) : (
                        <>
                          <em>{typeMeta.label}</em>
                          <i>·</i>
                          {frame ? frameLabel(frame.name) : '—'}
                          <i>·</i>
                          {cell.size} Bytes
                          {cell.sourceInstruction && (
                            <>
                              <i>·</i>
                              <code>{cell.sourceInstruction}</code>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {changed.has(cell.address) && direction !== 'reset' && (
                      <motion.span
                        key={`${currentStep}-${cell.address}`}
                        className="dyn-cell-flash"
                        data-kind={effect?.kind ?? 'write'}
                        initial={{ opacity: 0.55 }}
                        animate={{ opacity: 0 }}
                        transition={{ duration: 1.05, delay: 0.1, ease: 'easeOut' }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {ghostFrames.map((frame) => {
              const topRow = rowIndexForAddress(frame.stackEnd, state.stackTop)
              const bottomRow = rowIndexForAddress(frame.stackStart, state.stackTop)
              return (
                <div
                  key={`ghost-${frame.id}`}
                  className="dyn-frame"
                  data-ghost="true"
                  style={
                    {
                      top: rowTop(topRow) + 3,
                      height: (bottomRow - topRow + 1) * cellH - 4,
                      '--frame-color': frameToneMeta[frame.tone].color,
                    } as CSSProperties
                  }
                >
                  <span className="dyn-frame-label" data-ghost="true">
                    {frameLabel(frame.name)}
                    <em>已释放</em>
                  </span>
                </div>
              )
            })}

            <AnimatePresence initial={false}>
              {activeFrames.map((frame) => {
                const topRow = rowIndexForAddress(frame.stackEnd, state.stackTop)
                const bottomRow = rowIndexForAddress(frame.stackStart, state.stackTop)
                return (
                  <motion.div
                    key={frame.id}
                    className="dyn-frame"
                    data-current={currentFrame?.id === frame.id}
                    data-selected={selectedFrameId === frame.id}
                    style={
                      { '--frame-color': frameToneMeta[frame.tone].color } as CSSProperties
                    }
                    initial={false}
                    animate={{
                      top: rowTop(topRow) + 3,
                      height: (bottomRow - topRow + 1) * cellH - 4,
                    }}
                    exit={{ opacity: 0 }}
                    transition={geometryTransition}
                  >
                    <button
                      type="button"
                      className="dyn-frame-label"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedFrameId(frame.id)
                        focusVariable({
                          address: frame.frameBase ?? frame.stackEnd,
                          label: `${frameLabel(frame.name)} 栈帧 · ${hexAddress(frame.stackStart)}–${hexAddress(frame.stackEnd)} · ${frame.size} B`,
                        })
                      }}
                      title={`${frameLabel(frame.name)} 栈帧 ${hexAddress(frame.stackStart)}–${hexAddress(frame.stackEnd)} · ${frame.size} B`}
                    >
                      {frameLabel(frame.name)}
                      <span className="dyn-frame-range">
                        {hexAddress(frame.stackStart)}–{hexAddress(frame.stackEnd)}
                      </span>
                      <em>{frame.size} B</em>
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>

            <div className="dyn-lane dyn-lane-left" aria-label="ESP 指针">
              <motion.button
                type="button"
                className="dyn-pointer"
                data-side="esp"
                initial={false}
                animate={{ top: rowTop(espRow) + 1 + (cellH - CHIP_H) / 2 }}
                transition={geometryTransition}
                onClick={() =>
                  focusVariable({ address: state.esp, label: `ESP · ${hexAddress(state.esp)}` })
                }
                title={`ESP = ${hexAddress(state.esp)}${
                  currentFrame ? ` · ${frameLabel(currentFrame.name)}` : ''
                } · 点击定位`}
              >
                <span className="dyn-pointer-name">ESP</span>
                <span className="dyn-pointer-value">{hexAddress(state.esp)}</span>
                <span className="dyn-pointer-arrow" />
              </motion.button>
            </div>

            {ebpInside && (
              <div className="dyn-lane dyn-lane-right" aria-label="EBP 指针">
                <motion.button
                  type="button"
                  className="dyn-pointer"
                  data-side="ebp"
                  initial={false}
                  animate={{ top: rowTop(ebpRow) + 1 + (cellH - CHIP_H) / 2 }}
                  transition={geometryTransition}
                  onClick={() =>
                    focusVariable({ address: state.ebp, label: `EBP · ${hexAddress(state.ebp)}` })
                  }
                  title={`EBP = ${hexAddress(state.ebp)} · 点击定位`}
                >
                  <span className="dyn-pointer-arrow" />
                  <span className="dyn-pointer-name">EBP</span>
                  <span className="dyn-pointer-value">{hexAddress(state.ebp)}</span>
                </motion.button>
              </div>
            )}

            {hasEbp && !ebpInside && (
              <div className="dyn-lane dyn-lane-right" aria-label="EBP 位于栈区间之外">
                <div
                  className="dyn-pointer dyn-pointer-outside"
                  title={`EBP = ${hexAddress(state.ebp)}，位于当前模拟栈区间 ${hexAddress(
                    state.stackBottom,
                  )}–${hexAddress(state.stackTop)} 之外（调用者的帧基准），因此不画箭头`}
                >
                  <span className="dyn-pointer-name">EBP</span>
                  <span className="dyn-pointer-value">{hexAddress(state.ebp)}</span>
                  <span className="dyn-pointer-outside-tag">栈外</span>
                </div>
              </div>
            )}

            <AnimatePresence>
              {tokenAddress !== null && tokenAddress !== undefined && (
                <motion.div
                  key={`${currentStep}-${effect?.kind}`}
                  className="dyn-token"
                  data-kind={effect?.kind}
                  style={{
                    top: rowTop(rowIndexForAddress(tokenAddress, state.stackTop)) + 6,
                  }}
                  initial={{ opacity: 0, y: tokenDown ? -24 : 0, scale: 0.9 }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    y: tokenDown ? [-24, 0, 0, 0] : [0, -8, -24, -32],
                    scale: [0.9, 1, 1, 0.96],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.62, times: [0, 0.2, 0.75, 1], ease: 'easeInOut' }}
                >
                  <span>{tokenDown ? '↓' : '↑'}</span>
                  {effect?.label ?? ''}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="dyn-cap" data-edge="low">
            <span>低地址</span>
            <b>{hexAddress(state.stackBottom)}</b>
          </div>
        </div>
      </div>

      <div className="dyn-status" aria-live="polite">
        {selectedFrame ? (
          <span className="dyn-status-main">
            <b style={{ color: frameToneMeta[selectedFrame.tone].color }}>
              {frameLabel(selectedFrame.name)}
            </b>
            栈帧 {hexAddress(selectedFrame.stackStart)}–{hexAddress(selectedFrame.stackEnd)} ·{' '}
            {selectedFrame.size} B · EBP{' '}
            {selectedFrame.frameBase === null ? '未建立' : hexAddress(selectedFrame.frameBase)} ·
            返回地址{' '}
            {selectedFrame.returnAddress === null
              ? '—'
              : hexAddress(selectedFrame.returnAddress)}
          </span>
        ) : statusCell ? (
          <span className="dyn-status-main">
            <b>{hexAddress(statusCell.address)}</b>
            <span className="dyn-status-value">{rowValue(statusCell)}</span>
            {statusCell.label}
            <i>·</i>
            {statusCell.sourceInstruction ?? '无来源指令'}
          </span>
        ) : focusLabel ? (
          <span className="dyn-status-main">定位：{focusLabel}</span>
        ) : (
          <span className="dyn-status-hint">
            点击格子查看来源 · 点击 ESP/EBP 定位 · 滚轮滚动 · 双击空白处适应栈帧
          </span>
        )}
        <span className="dyn-status-frames">{activeFrames.length} frames</span>
      </div>

      <AnimatePresence>
        {inspect && (
          <CellInspector
            key={`${inspect.address}-${currentStep}`}
            state={state}
            cell={inspect}
            onClose={() => setInspect(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}



