import { motion } from 'framer-motion'
import {
  Check,
  ChevronRight,
  CornerDownRight,
  FileCode2,
  Flag,
  GraduationCap,
} from 'lucide-react'
import { useEffect, useRef, type CSSProperties } from 'react'
import { hex } from '../simulator/utils'
import { useSimulatorStore } from '../store/simulatorStore'
import { frameToneMeta } from '../ui/meta'
import { PanelHeader } from './PanelHeader'

const AsmText = ({ assembly }: { assembly: string }) => {
  const [op, ...rest] = assembly.split(' ')
  return (
    <>
      <span className="asm-op">{op}</span>
      {rest.length > 0 ? ` ${rest.join(' ')}` : ''}
    </>
  )
}

export const CodePanel = () => {
  const scenario = useSimulatorStore((state) => state.scenario)
  const currentStep = useSimulatorStore((state) => state.currentStep)
  const totalSteps = useSimulatorStore((state) => state.totalSteps)
  const timeline = useSimulatorStore((state) => state.timeline)
  const state = useSimulatorStore(
    (store) => store.timeline[store.currentStep].state,
  )
  const finished = state.finished
  const upcoming =
    currentStep < totalSteps ? scenario.instructions[currentStep] : null
  const lastExecuted =
    currentStep > 0 ? timeline[currentStep].instruction : null
  const isPreview = currentStep === 0
  const highlight = lastExecuted ?? upcoming
  const executed = new Set(state.executionHistory)
  const lineRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!highlight) return
    const line = lineRefs.current[highlight.id]
    line?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [highlight])

  const result = state.mainReturnValue ?? state.returnValue ?? state.eax

  return (
    <section className="panel code-panel" aria-label="x86 汇编代码">
      <PanelHeader
        icon={FileCode2}
        title="x86 汇编"
        subtitle={`Assembly · ${scenario.shortTitle}`}
        right={
          <span className="code-header-meta">
            EIP <b className="font-normal text-[#b7a1fa]">{hex(state.eip)}</b>
          </span>
        }
      />

      <div className="code-file-tab">
        <span className="code-file-name">
          <FileCode2 size={11} strokeWidth={1.7} />
          {scenario.id}.s
          <span className="rounded-[3px] bg-[#1b2a3e] px-[4px] py-[1px] text-[7px] text-[#6e89a8]">
            {scenario.codeGroups.length} fn
          </span>
        </span>
        <span className="code-syntax">Intel syntax</span>
      </div>

      <div className="code-source-badge" title={scenario.compiler.note}>
        <GraduationCap size={9} />
        <span>教学示意汇编</span>
        <span className="code-source-sep">·</span>
        <span className="text-[#5d738d]">非编译器实时输出</span>
      </div>

      <div className="code-scroll">
        {scenario.codeGroups.map((group) => {
          const tone = frameToneMeta[group.tone]
          return (
            <div className="code-group" key={group.id}>
              <div
                className="code-group-label"
                style={{ '--group-color': tone.color } as CSSProperties}
              >
                <b>{group.name}</b>
                <span>@ {hex(group.baseAddress)}</span>
                <span className="ml-auto normal-case tracking-normal text-[#526982]">
                  {group.instructions.length} 条
                </span>
              </div>

              {group.instructions.map((instruction) => {
                const current = highlight?.id === instruction.id
                const next = !isPreview && upcoming?.id === instruction.id
                const done = executed.has(instruction.id) && !current
                const status = current
                  ? isPreview
                    ? 'preview'
                    : 'current'
                  : next
                    ? 'next'
                    : done
                      ? 'done'
                      : 'pending'

                return (
                  <div
                    key={instruction.id}
                    ref={(node) => {
                      lineRefs.current[instruction.id] = node
                    }}
                    className="code-line"
                    data-state={status}
                    title={instruction.title}
                  >
                    {current && (
                      <motion.div
                        layoutId="code-active-highlight"
                        className="code-line-highlight"
                        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                      />
                    )}

                    <span className="code-address">{hex(instruction.address)}</span>

                    <span className="code-marker">
                      {current ? (
                        <ChevronRight
                          size={12}
                          className="code-current-arrow"
                          strokeWidth={2.5}
                        />
                      ) : next ? (
                        <CornerDownRight
                          size={10}
                          className="code-next-arrow"
                          strokeWidth={2.2}
                        />
                      ) : done ? (
                        <span className="code-complete">
                          <Check size={8} strokeWidth={3} />
                        </span>
                      ) : (
                        <span className="code-marker-dot" />
                      )}
                    </span>

                    <span className="code-content">
                      <span className="code-asm block">
                        <AsmText assembly={instruction.assembly} />
                      </span>
                      <span className="code-cn block">{instruction.title}</span>
                    </span>

                    {next && (
                      <span className="next-pill next-pill-eip">
                        <CornerDownRight size={8} strokeWidth={2.4} />
                        EIP 下一条
                      </span>
                    )}
                    {current && (
                      <span className="next-pill next-pill-current">
                        <span className="current-dot" />
                        {isPreview ? '待执行' : '当前'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {finished && (
          <motion.div
            className="code-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <Flag size={9} />
            程序结束 · {scenario.resultLabel} = {result}
          </motion.div>
        )}
      </div>

      <div className="code-footer">
        <span className="code-footer-status">
          <span className="dot" />
          {finished ? '执行完成' : currentStep === 0 ? '等待第一条指令' : '单步执行中'}
        </span>
        <span>
          {finished ? (
            state.mainReturnValue !== null ? (
              <>
                main 返回 <b>{state.mainReturnValue}</b>
                {state.processExitCode !== null && ` · exit ${state.processExitCode}`}
              </>
            ) : (
              <>
                EAX <b>{hex(state.eax)}</b> · {state.eax}
              </>
            )
          ) : (
            <>
              EIP <b>{hex(state.eip)}</b>
            </>
          )}
        </span>
      </div>
    </section>
  )
}
