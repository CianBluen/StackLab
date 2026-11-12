import { CodePanel } from './components/CodePanel'
import { ControlBar } from './components/ControlBar'
import { Header } from './components/Header'
import { InstructionPanel } from './components/InstructionPanel'
import { RegisterDock } from './components/RegisterDock'
import { SourcePanel } from './components/SourcePanel'
import { StackMemory } from './components/StackMemory'
import { useAutoPlay } from './hooks/useAutoPlay'
import { useKeyboardControls } from './hooks/useKeyboardControls'

const App = () => {
  useAutoPlay()
  useKeyboardControls()

  return (
    <div className="app-shell app-v2">
      <Header />

      <main className="workspace-v2">
        <SourcePanel />
        <CodePanel />
        <StackMemory />
      </main>

      <section className="teaching-dock" aria-label="寄存器与指令解释">
        <RegisterDock />
        <InstructionPanel />
      </section>

      <ControlBar />
    </div>
  )
}

export default App
