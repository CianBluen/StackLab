import { CodePanel } from './components/CodePanel'
import { ControlBar } from './components/ControlBar'
import { CSourceView } from './components/CSourceView'
import { DynamicStack } from './components/DynamicStack'
import { Header } from './components/Header'
import { InstructionPanel } from './components/InstructionPanel'
import { RegisterDock } from './components/RegisterDock'
import { SourcePanel } from './components/SourcePanel'
import { StackMemory } from './components/StackMemory'
import { useAutoPlay } from './hooks/useAutoPlay'
import { useKeyboardControls } from './hooks/useKeyboardControls'
import { useSimulatorStore } from './store/simulatorStore'

const TeachingDock = () => (
  <section className="teaching-dock" aria-label="寄存器与指令解释">
    <RegisterDock />
    <InstructionPanel />
  </section>
)

const App = () => {
  useAutoPlay()
  useKeyboardControls()
  const layout = useSimulatorStore((state) => state.layout)

  return (
    <div className="app-shell app-v2" data-layout={layout}>
      <Header />

      {layout === 'dynamic' && (
        <>
          <main className="workspace-v2 workspace-dynamic">
            <DynamicStack />
            <section className="dyn-right" aria-label="C 源码、汇编与指令解释">
              <CSourceView />
              <CodePanel />
              <InstructionPanel />
            </section>
          </main>
          <section className="dynamic-registers" aria-label="CPU 寄存器">
            <RegisterDock />
          </section>
        </>
      )}

      {layout === 'learn' && (
        <>
          <main className="workspace-v2">
            <SourcePanel />
            <CodePanel />
            <StackMemory />
          </main>
          <TeachingDock />
        </>
      )}

      <ControlBar />
    </div>
  )
}

export default App
