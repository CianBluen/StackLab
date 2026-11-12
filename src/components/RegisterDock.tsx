import { motion } from 'framer-motion'
import { Cpu, Info } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useSimulatorStore } from '../store/simulatorStore'
import type { RegisterName } from '../simulator/types'
import { hex } from '../simulator/utils'
import { registerMeta } from '../ui/meta'
import { PanelHeader } from './PanelHeader'

const REGISTERS: RegisterName[] = [
  'eax',
  'ebx',
  'ecx',
  'edx',
  'esi',
  'edi',
  'esp',
  'ebp',
  'eip',
]

const DIGITS: Record<RegisterName, number> = {
  eax: 8,
  ebx: 8,
  ecx: 8,
  edx: 8,
  esi: 8,
  edi: 8,
  esp: 4,
  ebp: 4,
  eip: 8,
}

const deltaLabel = (register: RegisterName, delta: number): string => {
  if (register === 'eip') return '更新'
  if (register === 'esp' || register === 'ebp') {
    return `${delta > 0 ? '+' : ''}${delta} B`
  }
  return `${delta > 0 ? '+' : ''}${delta}`
}

export const RegisterDock = () => {
  const currentStep = useSimulatorStore((state) => state.currentStep)
  const timeline = useSimulatorStore((state) => state.timeline)
  const state = useSimulatorStore(
    (store) => store.timeline[store.currentStep].state,
  )
  const focusRegister = useSimulatorStore((store) => store.focusRegister)
  const focusVariable = useSimulatorStore((store) => store.focusVariable)
  const previous = currentStep > 0 ? timeline[currentStep - 1].state : null
  const chain = state.callStack.map((frame) => frame.name)

  return (
    <section className="panel register-dock" aria-label="CPU 寄存器">
      <PanelHeader
        icon={Cpu}
        title="寄存器"
        subtitle="Registers · x86 32-bit"
        right={
          <span className="register-chain" title={chain.join(' → ')}>
            {chain.length > 0 ? chain.join(' › ') : '程序已结束'}
          </span>
        }
      />

      <div className="register-grid">
        {REGISTERS.map((register) => {
          const meta = registerMeta[register]
          const value = state[register]
          const oldValue = previous?.[register]
          const changed = previous !== null && oldValue !== value
          const focused = focusRegister === register
          const delta = oldValue === undefined ? 0 : value - oldValue
          const style = { '--reg-color': meta.color } as CSSProperties

          return (
            <motion.div
              key={register}
              className="register-mini"
              data-pointer={meta.group === 'pointer'}
              data-focused={focused}
              style={style}
              role="button"
              tabIndex={0}
              onClick={() =>
                focusVariable({
                  register,
                  label: `${meta.label} · ${hex(value, DIGITS[register])} · ${meta.role}`,
                })
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                focusVariable({
                  register,
                  label: `${meta.label} · ${hex(value, DIGITS[register])} · ${meta.role}`,
                })
              }}
              title={`${meta.label} · ${meta.role} · 点击设为联动焦点`}
              animate={
                focused
                  ? { borderColor: `${meta.color}aa`, boxShadow: `0 0 20px -6px ${meta.color}88` }
                  : { borderColor: 'rgba(47,65,89,0.62)', boxShadow: 'none' }
              }
              transition={{ duration: 0.25 }}
            >
              {changed && (
                <motion.div
                  key={`${currentStep}-${register}`}
                  className="register-mini-flash"
                  initial={{ opacity: 0.16 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                />
              )}
              <div className="register-mini-top">
                <span className="register-mini-name">{meta.label}</span>
                {changed ? (
                  <span className="register-mini-delta">{deltaLabel(register, delta)}</span>
                ) : (
                  <span className="register-mini-role">{meta.role}</span>
                )}
              </div>
              <motion.div
                key={`${register}-${value}`}
                className="register-mini-value"
                initial={{ y: changed ? 4 : 0, opacity: changed ? 0.35 : 1 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.25 }}
              >
                {hex(value, DIGITS[register])}
              </motion.div>
            </motion.div>
          )
        })}
      </div>

      <div className="register-abi-note">
        <Info size={9} />
        <span>
          ABI 提示：EAX / ECX / EDX 通常为 caller-saved；EBX / ESI / EDI / EBP 通常为
          callee-saved（具体以平台 ABI 为准）。
        </span>
      </div>
    </section>
  )
}
