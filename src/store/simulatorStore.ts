import { create } from 'zustand'
import { buildTimeline } from '../simulator/engine'
import {
  DEFAULT_SCENARIO_ID,
  SCENARIOS,
  getScenario,
} from '../simulator/scenarios'
import type {
  Direction,
  PlaybackSpeed,
  RegisterName,
  Scenario,
  TimelineEntry,
} from '../simulator/types'

interface FocusTarget {
  address?: number | null
  register?: RegisterName | null
  label: string
}

export type WorkspaceLayout = 'dynamic' | 'learn'

interface SimulatorStore {
  scenarioId: string
  scenario: Scenario
  debugFill: boolean
  layout: WorkspaceLayout
  timeline: TimelineEntry[]
  currentStep: number
  totalSteps: number
  direction: Direction
  isPlaying: boolean
  speed: PlaybackSpeed
  focusAddress: number | null
  focusRegister: RegisterName | null
  focusLabel: string | null
  /** 在汇编面板里点击某条指令时，临时查看它的解释，不改变当前执行步。 */
  inspectedInstructionId: string | null
  inspectedAtStep: number | null
  scenarios: Scenario[]
  stepForward: () => void
  stepBackward: () => void
  runToFunctionEnd: () => void
  advanceAuto: () => void
  jumpTo: (step: number) => void
  reset: () => void
  togglePlay: () => void
  pause: () => void
  setSpeed: (speed: PlaybackSpeed) => void
  selectScenario: (id: string) => void
  setDebugFill: (enabled: boolean) => void
  setLayout: (layout: WorkspaceLayout) => void
  focusVariable: (target: FocusTarget) => void
  clearFocus: () => void
  inspectInstruction: (id: string | null) => void
}

const searchParams = new URLSearchParams(
  typeof window === 'undefined' ? '' : window.location.search,
)

const initialScenario = getScenario(searchParams.get('case') ?? DEFAULT_SCENARIO_ID)
const initialDebugFill = true
const initialTimeline = buildTimeline(initialScenario, {
  debugFill: initialDebugFill,
})
const requestedStep = Number.parseInt(searchParams.get('step') ?? '', 10)
const initialStep = Number.isFinite(requestedStep)
  ? Math.max(0, Math.min(initialTimeline.length - 1, requestedStep))
  : 0
const requestedLayout = searchParams.get('layout')
const initialLayout: WorkspaceLayout =
  requestedLayout === 'learn' || requestedLayout === 'dynamic' ? requestedLayout : 'dynamic'

export const useSimulatorStore = create<SimulatorStore>((set, get) => ({
  scenarioId: initialScenario.id,
  scenario: initialScenario,
  debugFill: initialDebugFill,
  layout: initialLayout,
  timeline: initialTimeline,
  currentStep: initialStep,
  totalSteps: initialTimeline.length - 1,
  direction: initialStep > 0 ? 'forward' : 'reset',
  isPlaying: false,
  speed: 1,
  focusAddress: null,
  focusRegister: null,
  focusLabel: null,
  inspectedInstructionId: null,
  inspectedAtStep: null,
  scenarios: SCENARIOS,

  stepForward: () => {
    const { currentStep, totalSteps } = get()
    if (currentStep >= totalSteps) return
    set({
      currentStep: currentStep + 1,
      direction: 'forward',
      isPlaying: false,
      focusAddress: null,
      focusRegister: null,
      focusLabel: null,
    })
  },

  stepBackward: () => {
    const { currentStep } = get()
    if (currentStep <= 0) return
    set({
      currentStep: currentStep - 1,
      direction: 'back',
      isPlaying: false,
      focusAddress: null,
      focusRegister: null,
      focusLabel: null,
    })
  },

  runToFunctionEnd: () => {
    const { currentStep, totalSteps, scenario } = get()
    if (currentStep >= totalSteps) return
    const next = scenario.instructions[currentStep]
    if (!next) return
    const functionId = next.functionId
    let target = totalSteps
    for (let index = currentStep; index < scenario.instructions.length; index += 1) {
      if (scenario.instructions[index].functionId !== functionId) {
        target = index
        break
      }
    }
    if (target <= currentStep) return
    set({
      currentStep: target,
      direction: 'forward',
      isPlaying: false,
      focusAddress: null,
      focusRegister: null,
      focusLabel: null,
    })
  },

  advanceAuto: () => {
    const { currentStep, totalSteps } = get()
    if (currentStep >= totalSteps) {
      set({ isPlaying: false })
      return
    }
    set({
      currentStep: currentStep + 1,
      direction: 'forward',
      isPlaying: currentStep + 1 < totalSteps,
      focusAddress: null,
      focusRegister: null,
      focusLabel: null,
    })
  },

  jumpTo: (step) => {
    const { currentStep, totalSteps } = get()
    const nextStep = Math.max(0, Math.min(totalSteps, Math.round(step)))
    if (nextStep === currentStep) return
    set({
      currentStep: nextStep,
      direction: nextStep > currentStep ? 'forward' : 'back',
      isPlaying: false,
      focusAddress: null,
      focusRegister: null,
      focusLabel: null,
    })
  },

  reset: () => {
    set({
      currentStep: 0,
      direction: 'reset',
      isPlaying: false,
      focusAddress: null,
      focusRegister: null,
      focusLabel: null,
    })
  },

  togglePlay: () => {
    const { isPlaying, currentStep, totalSteps } = get()
    if (!isPlaying && currentStep >= totalSteps) {
      set({ currentStep: 0, isPlaying: true, direction: 'reset' })
      return
    }
    set({ isPlaying: !isPlaying })
  },

  pause: () => set({ isPlaying: false }),

  setSpeed: (speed) => set({ speed }),

  selectScenario: (id) => {
    const scenario = getScenario(id)
    const { debugFill } = get()
    const timeline = buildTimeline(scenario, { debugFill })
    set({
      scenarioId: scenario.id,
      scenario,
      timeline,
      currentStep: 0,
      totalSteps: timeline.length - 1,
      direction: 'reset',
      isPlaying: false,
      focusAddress: null,
      focusRegister: null,
      focusLabel: null,
    })
  },

  setDebugFill: (enabled) => {
    const { scenario } = get()
    const timeline = buildTimeline(scenario, { debugFill: enabled })
    set({
      debugFill: enabled,
      timeline,
      currentStep: 0,
      totalSteps: timeline.length - 1,
      direction: 'reset',
      isPlaying: false,
      focusAddress: null,
      focusRegister: null,
      focusLabel: null,
    })
  },

  setLayout: (layout) => set({ layout }),

  focusVariable: (target) =>
    set({
      focusAddress: target.address ?? null,
      focusRegister: target.register ?? null,
      focusLabel: target.label,
    }),

  clearFocus: () =>
    set({
      focusAddress: null,
      focusRegister: null,
      focusLabel: null,
    }),

  inspectInstruction: (id) =>
    set((state) => ({
      inspectedInstructionId: id,
      inspectedAtStep: id === null ? null : state.currentStep,
    })),
}))
