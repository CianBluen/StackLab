import { finalizeState } from './ops'
import type {
  ExecutionContext,
  Scenario,
  ScenarioPhase,
  SimulatorState,
  TimelineEntry,
} from './types'

export const buildTimeline = (
  scenario: Scenario,
  context: ExecutionContext,
): TimelineEntry[] => {
  let state = scenario.initialState(context)
  state = finalizeState(state)
  const timeline: TimelineEntry[] = [{ state, instruction: null }]

  scenario.instructions.forEach((instruction, index) => {
    const next = instruction.execute(state, context)
    next.currentInstructionIndex = index + 1
    next.executionHistory = [...state.executionHistory, instruction.id]
    next.eip = scenario.instructions[index + 1]?.address ?? scenario.endEip
    next.finished = index === scenario.instructions.length - 1
    if (next.finished) {
      next.returnValue = next.mainReturnValue ?? next.eax
    }
    timeline.push({
      state: finalizeState(next),
      instruction,
    })
    state = next
  })

  return timeline
}

export const snapshotAt = (
  timeline: TimelineEntry[],
  step: number,
): SimulatorState => {
  const safeStep = Math.max(0, Math.min(step, timeline.length - 1))
  return timeline[safeStep].state
}

export const currentPhase = (
  scenario: Scenario,
  step: number,
): ScenarioPhase | undefined =>
  scenario.phases?.find(
    (phase) => step >= phase.fromStep && step <= phase.toStep,
  )
