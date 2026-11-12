import {
  Braces,
  CircleDot,
  CornerDownRight,
  GraduationCap,
  MousePointerClick,
  Variable,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { currentPhase } from '../simulator/engine'
import { useSimulatorStore } from '../store/simulatorStore'
import type { CVariable } from '../simulator/types'
import {
  resolveScenarioVariables,
  type ResolvedVariable,
} from '../ui/variables'
import { PanelHeader } from './PanelHeader'

const KEYWORDS = new Set([
  'int',
  'char',
  'void',
  'return',
  'if',
  'else',
  'for',
  'while',
  'static',
  'const',
  'unsigned',
  'long',
  'short',
  'struct',
])

const tokenPattern =
  /([A-Za-z_]\w*|0x[0-9A-Fa-f]+|\d+|"[^"]*"|\s+|[^\sA-Za-z0-9_]+)/g

const variableAvailabilityClass = (
  resolved: ResolvedVariable | undefined,
): string => {
  if (!resolved) return ''
  if (resolved.availability === 'memory') return 'is-memory'
  if (resolved.availability === 'register') return 'is-register'
  if (resolved.availability === 'uninitialized') return 'is-uninit'
  return 'is-dim'
}

const CodeLine = ({
  text,
  variables,
  onVariable,
}: {
  text: string
  variables: CVariable[]
  onVariable: (variable: CVariable) => void
}) => {
  const tokens = text.match(tokenPattern) ?? []
  return (
    <>
      {tokens.map((token, index) => {
        if (/^\s+$/.test(token)) {
          return <span key={`space-${index}`}>{token}</span>
        }
        if (KEYWORDS.has(token)) {
          return (
            <span className="c-keyword" key={`${token}-${index}`}>
              {token}
            </span>
          )
        }
        if (/^0x[0-9A-Fa-f]+$|^\d+$/.test(token)) {
          return (
            <span className="c-number" key={`${token}-${index}`}>
              {token}
            </span>
          )
        }
        if (/^"/.test(token)) {
          return (
            <span className="c-string" key={`${token}-${index}`}>
              {token}
            </span>
          )
        }
        const variable = variables.find((candidate) => candidate.name === token)
        if (variable) {
          return (
            <button
              type="button"
              key={`${token}-${index}`}
              className={`c-variable ${variable.storage === 'register' ? 'is-register' : 'is-stack'}`}
              onClick={() => onVariable(variable)}
              title={`点击定位变量 ${variable.name}`}
            >
              {token}
            </button>
          )
        }
        if (/^[A-Za-z_]\w*$/.test(token)) {
          return (
            <span className="c-ident" key={`${token}-${index}`}>
              {token}
            </span>
          )
        }
        return <span key={`${token}-${index}`}>{token}</span>
      })}
    </>
  )
}

export const SourcePanel = () => {
  const scenario = useSimulatorStore((state) => state.scenario)
  const currentStep = useSimulatorStore((state) => state.currentStep)
  const totalSteps = useSimulatorStore((state) => state.totalSteps)
  const state = useSimulatorStore(
    (store) => store.timeline[store.currentStep].state,
  )
  const focusLabel = useSimulatorStore((store) => store.focusLabel)
  const focusVariable = useSimulatorStore((store) => store.focusVariable)
  const timeline = useSimulatorStore((store) => store.timeline)
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

  const activeFrame = state.callStack[state.callStack.length - 1]
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
    activeFrame?.functionId ??
    null
  const currentCLine = activeInstruction?.cLine ?? null
  const activeSourceFunction = scenario.cSource.functions.find(
    (fn) => fn.id === currentFunctionId,
  )
  const phase = currentPhase(scenario, currentStep)

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
    <section className="panel source-panel" aria-label="C 语言源代码">
      <PanelHeader
        icon={Braces}
        title="C 源代码"
        subtitle="Source · synced with asm"
        right={
          <span className="source-kind-badge" title={scenario.compiler.note}>
            <GraduationCap size={9} />
            教学示意
          </span>
        }
      />

      {scenario.phases && (
        <div className="scenario-phase-strip">
          {scenario.phases.map((item) => (
            <button
              type="button"
              key={item.id}
              className="scenario-phase"
              data-active={phase?.id === item.id}
              data-passed={(phase?.fromStep ?? 0) > item.toStep}
              style={{ '--phase-color': item.color } as CSSProperties}
              title={item.description}
            >
              <span>{item.id}</span>
              {item.label.split(' · ')[1] ?? item.label}
            </button>
          ))}
        </div>
      )}

      <div className="source-context">
        <span className="source-context-fn">
          <CircleDot size={8} />
          {activeSourceFunction ? `${activeSourceFunction.name}()` : '启动 / 运行时'}
        </span>
        <span className="source-context-line">
          {currentCLine ? `C line ${currentCLine}` : '无 C 行映射'}
        </span>
        {phase && <span className="source-context-phase">{phase.id} 阶段</span>}
      </div>

      <div className="source-scroll">
        <div className="source-code">
          {scenario.cSource.lines.map((line) => {
            const owner = scenario.cSource.functions.find(
              (fn) => fn.id === line.functionId,
            )
            const isActiveFunction =
              !!owner && !!currentFunctionId && owner.id === currentFunctionId
            const isCurrentLine = currentCLine === line.number
            const lineVariables = scenario.variables.filter(
              (variable) =>
                variable.functionId === line.functionId &&
                line.text.includes(variable.name),
            )
            const isFunctionStart = owner?.startLine === line.number

            return (
              <div
                ref={(node) => {
                  lineRefs.current[line.number] = node
                }}
                className="c-line"
                key={line.number}
                data-active-function={isActiveFunction}
                data-current={isCurrentLine}
              >
                <span className="c-line-number">{String(line.number).padStart(2, '0')}</span>
                <span className="c-line-marker" />
                <code className="c-line-text">
                  <CodeLine
                    text={line.text}
                    variables={lineVariables}
                    onVariable={handleVariable}
                  />
                </code>
                {isFunctionStart && (
                  <span className="c-function-chip">
                    {owner.name}()
                    {owner.id === currentFunctionId && <b>执行中</b>}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="variable-panel">
        <div className="variable-head">
          <span className="flex items-center gap-[5px]">
            <Variable size={10} />
            变量监视
          </span>
          <span className="variable-hint">
            <MousePointerClick size={8} />
            点击定位
          </span>
        </div>

        <div className="variable-list">
          {resolved.map((item) => {
            const available =
              item.availability === 'memory' || item.availability === 'register'
            const isFocused =
              focusLabel === `${item.variable.functionId}()::${item.variable.name}` ||
              focusLabel === `${item.variable.name} → ${item.register?.toUpperCase()}`
            return (
              <button
                type="button"
                key={`${item.variable.functionId}-${item.variable.name}`}
                className="variable-row"
                data-available={available}
                data-focused={isFocused}
                data-storage={item.variable.storage}
                onClick={() => handleVariable(item.variable)}
                title={item.detail}
              >
                <span className="variable-name">{item.variable.name}</span>
                <span className="variable-type">{item.variable.typeLabel}</span>
                <span className="variable-storage">{item.storageLabel}</span>
                <span
                  className={`variable-value ${variableAvailabilityClass(item)}`}
                >
                  {item.valueText}
                </span>
              </button>
            )
          })}
        </div>

        {notice && (
          <div className="variable-notice">
            <CornerDownRight size={9} />
            {notice}
          </div>
        )}
      </div>
    </section>
  )
}
