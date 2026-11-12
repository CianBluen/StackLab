import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  GraduationCap,
  X,
} from 'lucide-react'
import { useEffect } from 'react'
import { useSimulatorStore } from '../store/simulatorStore'

interface CaseLibraryProps {
  open: boolean
  onClose: () => void
}

const levelColor: Record<string, string> = {
  入门: '#5fd3a7',
  进阶: '#f0b969',
  深入: '#b28cff',
}

export const CaseLibrary = ({ open, onClose }: CaseLibraryProps) => {
  const scenarios = useSimulatorStore((state) => state.scenarios)
  const currentId = useSimulatorStore((state) => state.scenarioId)
  const selectScenario = useSimulatorStore((state) => state.selectScenario)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="case-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="case-modal"
            role="dialog"
            aria-modal="true"
            aria-label="汇编案例库"
            initial={{ opacity: 0, y: 18, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="case-modal-head">
              <div className="flex items-center gap-3">
                <div className="case-modal-icon">
                  <BookOpen size={18} strokeWidth={1.8} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2>汇编案例库</h2>
                    <span className="case-count">{scenarios.length} 个案例</span>
                  </div>
                  <p>每个案例都有独立的模拟时间线、C 映射与栈帧布局。</p>
                </div>
              </div>
              <button type="button" className="case-close" onClick={onClose} aria-label="关闭案例库">
                <X size={16} />
              </button>
            </div>

            <div className="compiler-mode-bar">
              <span className="compiler-mode-label">编译器档案</span>
              <span>手写教学汇编</span>
              <span className="compiler-mode-sep">·</span>
              <span>x86-32 cdecl</span>
              <span className="compiler-mode-sep">·</span>
              <span>教学展开 / 非优化输出</span>
              <span className="compiler-mode-disabled">
                真实 GCC / Clang / MSVC 编译模式：未接入
              </span>
            </div>

            <div className="case-grid">
              {scenarios.map((scenario, index) => {
                const active = scenario.id === currentId
                return (
                  <motion.button
                    type="button"
                    key={scenario.id}
                    className="case-card"
                    data-active={active}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * index }}
                    onClick={() => {
                      selectScenario(scenario.id)
                      onClose()
                    }}
                  >
                    <div className="case-card-top">
                      <span className="case-index">{String(index + 1).padStart(2, '0')}</span>
                      <span
                        className="case-level"
                        style={{
                          color: levelColor[scenario.level],
                          borderColor: `${levelColor[scenario.level]}40`,
                          background: `${levelColor[scenario.level]}0d`,
                        }}
                      >
                        {scenario.level}
                      </span>
                      <span className="case-source-type">
                        <GraduationCap size={9} />
                        教学示意
                      </span>
                      {active && (
                        <span className="case-active-mark">
                          <Check size={9} strokeWidth={3} />
                          当前
                        </span>
                      )}
                    </div>
                    <div className="case-card-title">{scenario.title}</div>
                    <div className="case-card-sub">
                      <Code2 size={10} />
                      {scenario.subtitle}
                    </div>
                    <p className="case-card-desc">{scenario.description}</p>
                    <div className="case-tags">
                      {scenario.tags.slice(0, 4).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <div className="case-card-foot">
                      <span className="font-mono">
                        {scenario.instructions.length} 条指令 · {scenario.codeGroups.length} 个函数
                      </span>
                      <span className="case-open">
                        打开案例
                        <ChevronRight size={11} />
                      </span>
                    </div>
                  </motion.button>
                )
              })}
            </div>

            <div className="case-modal-note">
              <div className="flex items-start gap-2">
                <ArrowRight size={12} className="mt-[2px] shrink-0 text-[#b28cff]" />
                <p>
                  <strong>汇编来源说明：</strong>
                  当前 6 个案例均为逐条核对的教学示意汇编，<b>不是</b> GCC / Clang / MSVC
                  的实时编译输出。真实编译器模式（输入 C、实时生成汇编并导入模拟器）尚未接入；界面中的编译器档案会明确标注这一点。
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
