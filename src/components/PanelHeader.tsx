import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface PanelHeaderProps {
  icon: LucideIcon
  title: string
  subtitle: string
  right?: ReactNode
}

export const PanelHeader = ({
  icon: Icon,
  title,
  subtitle,
  right,
}: PanelHeaderProps) => (
  <div className="panel-header">
    <div className="panel-title-wrap">
      <div className="panel-icon">
        <Icon size={13} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <div className="panel-title">{title}</div>
        <div className="panel-subtitle">{subtitle}</div>
      </div>
    </div>
    {right}
  </div>
)
