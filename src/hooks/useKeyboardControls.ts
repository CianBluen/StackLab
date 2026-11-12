import { useEffect } from 'react'
import { useSimulatorStore } from '../store/simulatorStore'

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return (
    target.isContentEditable ||
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select'
  )
}

export const useKeyboardControls = (): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      const store = useSimulatorStore.getState()

      if (event.code === 'ArrowRight') {
        event.preventDefault()
        store.stepForward()
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault()
        store.stepBackward()
      } else if (event.code === 'Space') {
        event.preventDefault()
        store.togglePlay()
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        store.reset()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
