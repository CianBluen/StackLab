import { BookOpen, Waves } from 'lucide-react'
import { useSimulatorStore, type WorkspaceLayout } from '../store/simulatorStore'

const LAYOUTS: {
  id: WorkspaceLayout
  label: string
  short: string
  icon: typeof BookOpen
  hint: string
}[] = [
  {
    id: 'dynamic',
    label: '动态栈布局',
    short: '动态',
    icon: Waves,
    hint: '左动态栈动画 · 右 C / 汇编 / 讲解 · 底部寄存器',
  },
  {
    id: 'learn',
    label: '学习布局',
    short: '学习',
    icon: BookOpen,
    hint: 'C 源码 · 汇编 · 栈表格三栏对照，适合第一次逐条理解指令',
  },
]

export const LayoutSwitcher = () => {
  const layout = useSimulatorStore((state) => state.layout)
  const setLayout = useSimulatorStore((state) => state.setLayout)

  return (
    <div className="layout-switch" role="group" aria-label="工作布局">
      {LAYOUTS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            className="layout-switch-btn"
            data-active={layout === item.id}
            onClick={() => setLayout(item.id)}
            title={`${item.label} · ${item.hint}`}
            aria-label={item.label}
            aria-pressed={layout === item.id}
          >
            <Icon size={11} strokeWidth={1.9} />
            <span>{item.short}</span>
          </button>
        )
      })}
    </div>
  )
}
