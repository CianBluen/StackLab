import { Braces, GraduationCap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSimulatorStore } from '../store/simulatorStore'
import type { CVariable } from '../simulator/types'
import { resolveScenarioVariables } from '../ui/variables'
import { CodeText } from './CodeText'
import { PanelHeader } from './PanelHeader'

/**
 * 动态页右侧的 C 源码窗口：只读、带行号与语法高亮，
 * 当前汇编映射到的 C 行会高亮，点击变量可定位到左侧动态栈。
 */
export const CSourceView = () => {
  const scenario = useSimulatorStore((state) => state.scenario)
  const currentStep = useSimulatorStore((state) => state.currentStep)
  const totalSteps = useSimulatorStore((state) => state.totalSteps)
  const timeline = useSimulatorStore((state) => state.timeline)
  const state = useSimulatorStore(
    (store) => store.timeline[store.currentStep].state,
  )
  const focusVariable = useSimulatorStore((store) => store.focusVariable)

  const [notice, setNotice] = useState<string | null>(null)
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({})

  useEffect(() => {
    setNotice(null)
  }, [scenario.id])

  const resolved = useMemo(
    () => resolveScenarioVariables(state, scenario),
    [scenario, state],
  )
  const resolvedMap = useMemo(
    () => new Map(resolved.map((item) => [item.variable.name, item])),
    [resolved],
  )

  // 与 SourcePanel 相同的时间线口径：优先显示“刚执行的指令”，第 0 步显示下一条。
  const upcoming =
    currentStep < totalSteps ? scenario.instructions[currentStep] : null
  const lastExecuted =
    currentStep > 0 ? timeline[currentStep].instruction : null
  const activeInstruction =
    lastExecuted ??
    upcoming ??
    scenario.instructions[scenario.instructions.length - 1]
  const currentFunctionId =
    activeInstruction?.functionId ??
    state.callStack[state.callStack.length - 1]?.functionId ??
    null
  const currentCLine = activeInstruction?.cLine ?? null
  const activeFunction = scenario.cSource.functions.find(
    (fn) => fn.id === currentFunctionId,
  )

  useEffect(() => {
    if (currentCLine === null) return
    lineRefs.current[currentCLine]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [currentCLine])

  const handleVariable = (variable: CVariable) => {
    const info = resolvedMap.get(variable.name)
    if (!info) return
    if (info.availability === 'memory' && info.address !== null) {
      setNotice(null)
      focusVariable({
        address: info.address,
        label: `${variable.functionId}()::${variable.name}`,
      })
      return
    }
    if (info.availability === 'register' && info.register) {
      setNotice(null)
      focusVariable({
        register: info.register,
        label: `${variable.name} → ${info.register.toUpperCase()}`,
      })
      return
    }
    setNotice(`${variable.name}: ${info.detail}`)
  }

  return (
    <section className="panel c-source-panel" aria-label="C 源代码">
      <PanelHeader
        icon={Braces}
        title="C 源代码"
        subtitle="Source · synced with asm"
        right={
          <div className="c-source-head">
            <span className="c-source-fn">
              {activeFunction ? `${activeFunction.name}()` : '启动 / 运行时'}
            </span>
            <span className="c-source-line" data-empty={currentCLine === null}>
              {currentCLine === null ? '序言' : `C ${currentCLine}`}
            </span>
            <span className="source-kind-badge" title="手写教学 C 源码，与当前教学汇编一一对应">
              <GraduationCap size={9} />
              教学示意
            </span>
          </div>
        }
      />

      <div
        className="c-source-strip"
        data-empty={currentCLine === null}
        data-prologue={activeInstruction?.isPrologue === true}
      >
        {activeInstruction?.isPrologue ? (
          <>
            编译器生成的函数序言：为 {activeFunction?.name ?? '当前函数'} 建立栈帧，不直接对应某一条 C 语句
          </>
        ) : currentCLine === null ? (
          <>
            当前指令不对应具体 C 行
            {activeFunction ? `（属于 ${activeFunction.name}）` : ''}
          </>
        ) : (
          <>
            第 {currentCLine} 行
            {activeFunction ? ` · ${activeFunction.signature}` : ''}
          </>
        )}
      </div>

      <div className="c-source-scroll">
        <div className="c-source-code">
          {scenario.cSource.lines.map((line) => {
            const owner = scenario.cSource.functions.find(
              (fn) => fn.id === line.functionId,
            )
            const isActiveFunction =
              !!owner && !!currentFunctionId && owner.id === currentFunctionId
            const isCurrent = currentCLine === line.number
            const lineVariables = scenario.variables.filter(
              (variable) =>
                variable.functionId === line.functionId &&
                line.text.includes(variable.name),
            )
            const isFunctionStart = owner?.startLine === line.number

            return (
              <div
                key={line.number}
                ref={(node) => {
                  lineRefs.current[line.number] = node
                }}
                className="c-source-row"
                data-active-function={isActiveFunction}
                data-current={isCurrent}
                data-blank={line.text.trim() === ''}
              >
                <span className="c-source-lineno">
                  {String(line.number).padStart(2, '0')}
                </span>
                <span className="c-source-marker" />
                <code className="c-source-text">
                  <CodeText
                    text={line.text}
                    variables={lineVariables}
                    onVariable={handleVariable}
                  />
                </code>
                {isFunctionStart && (
                  <span className="c-source-fnchip">{owner.name}()</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {notice && <div className="c-source-notice">{notice}</div>}
    </section>
  )
}
