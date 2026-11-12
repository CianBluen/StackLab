import { motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileCode2,
  Lightbulb,
  Move3d,
  Terminal,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import {
  CELL_SIZE,
  type RegisterName,
  type SimulatorState,
} from '../simulator/types'
import { hex, hexAddress, renderTemplate } from '../simulator/utils'
import { useSimulatorStore } from '../store/simulatorStore'
import { registerMeta } from '../ui/meta'
import { PanelHeader } from './PanelHeader'

const BASE_DIFF_REGISTERS: RegisterName[] = ['esp', 'ebp', 'eax']
const EXTRA_DIFF_REGISTERS: RegisterName[] = ['ebx', 'ecx', 'edx', 'esi', 'edi']

const ADDRESSING_LABEL = {
  read: '读取',
  write: '写入',
  lea: '取地址',
} as const

const digitsFor = (register: RegisterName): number =>
  register === 'esp' || register === 'ebp' ? 4 : 8

const AsmText = ({ assembly }: { assembly: string }) => {
  const [op, ...rest] = assembly.split(' ')
  return (
    <>
      <span className="assembly-op">{op}</span>
      {rest.length > 0 ? ` ${rest.join(' ')}` : ''}
    </>
  )
}

const DiffRow = ({
  register,
  before,
  after,
}: {
  register: RegisterName
  before: SimulatorState
  after: SimulatorState
}) => {
  const beforeValue = before[register]
  const afterValue = after[register]
  const delta = afterValue - beforeValue
  const changed = delta !== 0
  const meta = registerMeta[register]

  return (
    <div className="diff-row">
      <span className="diff-label" style={{ '--diff-color': meta.color } as CSSProperties}>
        {meta.label}
      </span>
      <span className="diff-value">{hex(beforeValue, digitsFor(register))}</span>
      <span className="diff-arrow">
        <ArrowRight size={8} strokeWidth={1.8} />
        {changed && (
          <span className="diff-delta">
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </span>
      <motion.span
        key={`${register}-${afterValue}`}
        className={`diff-value after ${changed ? 'changed' : ''}`}
        initial={{ color: changed ? meta.color : '#d4e0ef', opacity: changed ? 0.4 : 1 }}
        animate={{ color: changed ? '#ffffff' : '#d4e0ef', opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
        {hex(afterValue, digitsFor(register))}
      </motion.span>
    </div>
  )
}

export const InstructionPanel = () => {
  const scenario = useSimulatorStore((state) => state.scenario)
  const currentStep = useSimulatorStore((state) => state.currentStep)
  const timeline = useSimulatorStore((state) => state.timeline)
  const totalSteps = useSimulatorStore((state) => state.totalSteps)
  const inspectedId = useSimulatorStore((state) => state.inspectedInstructionId)
  const inspectedAtStep = useSimulatorStore((state) => state.inspectedAtStep)
  const inspectInstruction = useSimulatorStore((state) => state.inspectInstruction)

  const isPreview = currentStep === 0
  const inspectIndex =
    inspectedId !== null && inspectedAtStep === currentStep
      ? timeline.findIndex((entry) => entry.instruction?.id === inspectedId)
      : -1
  const isInspecting = inspectIndex > 0
  const viewIndex = isInspecting ? inspectIndex : isPreview ? 1 : currentStep
  const instruction = isInspecting
    ? timeline[inspectIndex].instruction
    : isPreview
      ? scenario.instructions[0]
      : timeline[currentStep].instruction
  const before = timeline[viewIndex - 1].state
  const after = timeline[viewIndex].state
  const finished = !isInspecting && timeline[currentStep].state.finished
  const stepNumber = viewIndex
  const espDelta = after.esp - before.esp
  const ebpDelta = after.ebp - before.ebp
  const diffRegisters: RegisterName[] = [
    ...BASE_DIFF_REGISTERS,
    ...EXTRA_DIFF_REGISTERS.filter((register) => before[register] !== after[register]).slice(
      0,
      2,
    ),
  ]

  if (!instruction) return null

  const title = renderTemplate(instruction.title, before, after)
  const explanation = renderTemplate(instruction.explanation, before, after)
  const reason = renderTemplate(instruction.reason, before, after)
  const sourceFunction = scenario.cSource.functions.find(
    (fn) => fn.id === instruction.functionId,
  )
  const addressing = instruction.addressing
  const addressingBase =
    addressing === null || addressing === undefined
      ? null
      : addressing.base === 'ebp'
        ? before.ebp
        : before.esp
  const addressingTarget =
    addressing === null || addressing === undefined || addressingBase === null
      ? null
      : addressingBase + addressing.offset

  return (
    <section className="panel instruction-panel dock-instruction" aria-label="指令解释">
      <PanelHeader
        icon={BookOpen}
        title="指令解析"
        subtitle="Instruction explainer"
        right={
          <div className="flex items-center gap-2">
            {isInspecting ? (
              <button
                type="button"
                className="dock-inspecting"
                onClick={() => inspectInstruction(null)}
                title="回到当前执行位置"
              >
                查看第 {stepNumber} 步 · 返回
              </button>
            ) : (
              <span className="panel-meta">
                {isPreview ? '即将执行' : finished ? '最后一条' : '已执行'} {stepNumber} /{' '}
                {totalSteps}
              </span>
            )}
            {instruction.cLine && (
              <span className="dock-cline">
                <FileCode2 size={8} />
                C line {instruction.cLine}
              </span>
            )}
            {instruction.isSystemAction && (
              <span className="dock-system">
                <Terminal size={8} />
                系统动作 · 非 x86 指令
              </span>
            )}
            {finished && (
              <span className="dock-complete">
                <CheckCircle2 size={8} />
                完成
              </span>
            )}
          </div>
        }
      />

      <div className="instruction-body">
        <div className="instruction-copy">
          <div className="instruction-kicker">
            <span className="kicker-line" />
            {isInspecting
              ? '查看历史指令（不改变执行位置）'
              : isPreview
                ? '下一条待执行'
                : '刚执行的指令'}
            <span className="ml-auto rounded-[3px] border border-[#31445e] bg-[#101b2a] px-[5px] py-[1px] text-[7px] font-medium tracking-[0.04em] text-[#7087a1]">
              {instruction.functionName} · {hex(instruction.address)}
            </span>
          </div>

          <div className="instruction-assembly" title={instruction.assembly}>
            <AsmText assembly={instruction.assembly} />
          </div>
          <div className="instruction-title">{title}</div>
          <p className="instruction-text">{explanation}</p>
          {addressing && addressingTarget !== null && (
            <div className="addr-calc" data-kind={addressing.kind}>
              <span className="addr-calc-kind">
                <Move3d size={9} />
                {ADDRESSING_LABEL[addressing.kind]}
              </span>
              <code className="addr-calc-formula">
                {addressing.base.toUpperCase()} {hexAddress(addressingBase ?? 0)}
                {addressing.offset >= 0 ? ' + ' : ' − '}
                {Math.abs(addressing.offset)}
                {' = '}
                <b>{hexAddress(addressingTarget)}</b>
              </code>
              <span className="addr-calc-note">
                {addressing.kind === 'read'
                  ? '读该单元'
                  : addressing.kind === 'write'
                    ? '写该单元'
                    : '只算地址，不读内存'}
              </span>
            </div>
          )}
          {isPreview && !isInspecting && (
            <div className="intro-suggestion mt-[2px]">
              点击「下一步」执行这条指令，观察 C / 汇编 / 寄存器 / 栈内存同步变化。
            </div>
          )}
        </div>

        <div className="diff-card">
          <div className="diff-head">
            <span>寄存器</span>
            <span>执行前</span>
            <span>变化</span>
            <span>{isPreview ? '执行后（预计）' : '执行后'}</span>
          </div>
          {diffRegisters.map((register) => (
            <DiffRow key={register} register={register} before={before} after={after} />
          ))}
          <div className="diff-eip">
            <span>EIP {hex(before.eip)}</span>
            <span className="flex items-center gap-1">
              <ArrowRight size={8} />
              <b>{hex(after.eip)}</b>
            </span>
          </div>
          <div className="diff-memory">
            <span className="diff-memory-label">内存</span>
            <b className="diff-memory-value">
              {after.lastEffect && after.lastEffect.addresses.length > 0
                ? after.lastEffect.addresses
                    .slice(0, 2)
                    .map((address) => hexAddress(address))
                    .join(' / ') +
                  (after.lastEffect.addresses.length > 2
                    ? ` +${after.lastEffect.addresses.length - 2}`
                    : '')
                : '未访问'}
            </b>
            <span className="diff-memory-note">{after.lastEffect?.label ?? ''}</span>
          </div>
          <div className="diff-source">
            {sourceFunction ? (
              <>
                <span className="diff-source-dot" />
                {sourceFunction.signature}
              </>
            ) : (
              <>
                <span className="diff-source-dot" data-runtime="true" />
                启动 / 运行时代码
              </>
            )}
          </div>
        </div>
      </div>

      <div className="reason-bar">
        <div className="reason-icon">
          <Lightbulb size={11} strokeWidth={1.9} />
        </div>
        <div className="reason-copy">
          <div className="flex items-center gap-2">
            <span className="reason-label">变化原因</span>
            <span className="rounded-[3px] bg-[#27364a] px-[4px] py-[1px] font-mono text-[7px] text-[#7f94ad]">
              ΔESP {espDelta > 0 ? '+' : ''}
              {espDelta} B · ΔEBP {ebpDelta > 0 ? '+' : ''}
              {ebpDelta} B · 1 cell = {CELL_SIZE} B
            </span>
          </div>
          <p className="reason-text">{reason}</p>
        </div>
      </div>
    </section>
  )
}
