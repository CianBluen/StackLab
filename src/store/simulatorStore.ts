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

interface SimulatorStore {
  scenarioId: string
  scenario: Scenario
  debugFill: boolean
  timeline: TimelineEntry[]
  currentStep: number
  totalSteps: number
  direction: Direction
  isPlaying: boolean
  speed: PlaybackSpeed
  focusAddress: number | null
  focusRegister: RegisterName | null
  focusLabel: string | null
  scenarios: Scenario[]
  stepForward: () => void
  stepBackward: () => void
  advanceAuto: () => void
  jumpTo: (step: number) => void
  reset: () => void
  togglePlay: () => void
  pause: () => void
  setSpeed: (speed: PlaybackSpeed) => void
  selectScenario: (id: string) => void
  setDebugFill: (enabled: boolean) => void
  focusVariable: (target: FocusTarget) => void
  clearFocus: () => void
}

const initialScenario = getScenario(DEFAULT_SCENARIO_ID)
const initialDebugFill = true
const initialTimeline = buildTimeline(initialScenario, {
  debugFill: initialDebugFill,
})

export const useSimulatorStore = create<SimulatorStore>((set, get) => ({
  scenarioId: initialScenario.id,
  scenario: initialScenario,
  debugFill: initialDebugFill,
  timeline: initialTimeline,
  currentStep: 0,
  totalSteps: initialTimeline.length - 1,
  direction: 'reset',
  isPlaying: false,
  speed: 1,
  focusAddress: null,
  focusRegister: null,
  focusLabel: null,
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
}))
