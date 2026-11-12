import { useEffect } from 'react'
import { useSimulatorStore } from '../store/simulatorStore'

const BASE_INTERVAL = 1500

export const useAutoPlay = (): void => {
  const isPlaying = useSimulatorStore((state) => state.isPlaying)
  const currentStep = useSimulatorStore((state) => state.currentStep)
  const totalSteps = useSimulatorStore((state) => state.totalSteps)
  const speed = useSimulatorStore((state) => state.speed)
  const advanceAuto = useSimulatorStore((state) => state.advanceAuto)

  useEffect(() => {
    if (!isPlaying) return
    if (currentStep >= totalSteps) return

    const timer = window.setTimeout(() => {
      advanceAuto()
    }, BASE_INTERVAL / speed)

    return () => window.clearTimeout(timer)
  }, [advanceAuto, currentStep, isPlaying, speed, totalSteps])
}
