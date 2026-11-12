import { motion } from 'framer-motion'
import { Braces, Bug, ChevronDown, Cpu, Layers3, LibraryBig } from 'lucide-react'
import { useState } from 'react'
import { currentPhase } from '../simulator/engine'
import { useSimulatorStore } from '../store/simulatorStore'
import { CaseLibrary } from './CaseLibrary'
import { Logo } from './Logo'

const statusConfig = {
  ready: { label: '准备就绪', color: '#89a3c0' },
  playing: { label: '自动播放中', color: '#68b6ff' },
  stepping: { label: '单步调试中', color: '#f0b969' },
  finished: { label: '执行完成', color: '#63e0b0' },
} as const

export const Header = () => {
  const scenario = useSimulatorStore((state) => state.scenario)
  const currentStep = useSimulatorStore((state) => state.currentStep)
  const totalSteps = useSimulatorStore((state) => state.totalSteps)
  const isPlaying = useSimulatorStore((state) => state.isPlaying)
  const debugFill = useSimulatorStore((state) => state.debugFill)
  const setDebugFill = useSimulatorStore((state) => state.setDebugFill)
  const finished = useSimulatorStore(
    (state) => state.timeline[state.currentStep].state.finished,
  )
  const [libraryOpen, setLibraryOpen] = useState(false)

  const status = finished
    ? statusConfig.finished
    : isPlaying
      ? statusConfig.playing
      : currentStep === 0
        ? statusConfig.ready
        : statusConfig.stepping

  const phase = currentPhase(scenario, currentStep)

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <div>
            <div className="brand-title">
              Stack<span className="text-[#6fbbff]">Lab</span>
              <span className="ml-[5px] inline-block h-[4px] w-[4px] rounded-full bg-[#37d99b] align-middle shadow-[0_0_7px_#37d99b]" />
            </div>
            <div className="brand-subtitle">x86 Stack Frame Laboratory</div>
          </div>
        </div>

        <div className="topbar-divider" />

        <button
          type="button"
          className="case-trigger"
          onClick={() => setLibraryOpen(true)}
          title="打开汇编案例库"
        >
          <span className="case-trigger-icon">
            <LibraryBig size={14} strokeWidth={1.9} />
          </span>
          <span className="case-trigger-copy">
            <span className="case-trigger-label">汇编案例</span>
            <strong>{scenario.shortTitle}</strong>
          </span>
          <ChevronDown size={12} className="text-[#6e849d]" />
        </button>

        <div className="mode-cluster">
          <div className="chip">
            <Cpu size={12} className="chip-icon" strokeWidth={1.9} />
            <span>x86</span>
            <strong>32-bit</strong>
          </div>
          <div className="chip">
            <Braces size={12} className="chip-icon" strokeWidth={1.9} />
            <span>ABI</span>
            <strong>cdecl</strong>
          </div>
          {phase && (
            <div
              className="chip phase-chip"
              style={{
                borderColor: `${phase.color}45`,
                background: `${phase.color}10`,
                color: phase.color,
              }}
              title={phase.description}
            >
              <Layers3 size={11} />
              <strong style={{ color: phase.color }}>{phase.label}</strong>
            </div>
          )}
        </div>

        <div className="topbar-spacer" />

        <button
          type="button"
          className="debug-toggle"
          data-on={debugFill}
          role="switch"
          aria-checked={debugFill}
          onClick={() => setDebugFill(!debugFill)}
          title="开启后，sub esp 预留的未初始化局部变量区显示 0xCCCCCCCC；切换会回到第 0 步"
        >
          <Bug size={12} strokeWidth={1.9} />
          <span>Debug Fill</span>
          <span className="debug-switch">
            <motion.span layout className="debug-knob" />
          </span>
          <span className="debug-value">{debugFill ? 'CC' : 'OFF'}</span>
        </button>

        <div className="topbar-divider" />

        <div className="progress-cluster">
          <div>
            <div className="progress-label">执行进度</div>
            <div className="progress-value">
              {String(currentStep).padStart(2, '0')}
              <span className="mx-[3px] text-[#4e637c]">/</span>
              {totalSteps}
            </div>
          </div>
          <div className="progress-meter">
            <motion.div
              className="progress-meter-fill"
              initial={false}
              animate={{ width: `${(currentStep / Math.max(totalSteps, 1)) * 100}%` }}
              transition={{ type: 'spring', stiffness: 170, damping: 24 }}
            />
          </div>
          <div
            className="status-pill"
            style={{
              color: status.color,
              borderColor: `${status.color}3d`,
              backgroundColor: `${status.color}10`,
            }}
          >
            <span className="status-dot" />
            {status.label}
          </div>
        </div>
      </header>

      <CaseLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} />
    </>
  )
}
