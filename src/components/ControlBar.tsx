import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
import type { PlaybackSpeed } from '../simulator/types'
import { useSimulatorStore } from '../store/simulatorStore'

const SPEEDS: PlaybackSpeed[] = [0.5, 1, 2]

export const ControlBar = () => {
  const currentStep = useSimulatorStore((state) => state.currentStep)
  const totalSteps = useSimulatorStore((state) => state.totalSteps)
  const isPlaying = useSimulatorStore((state) => state.isPlaying)
  const speed = useSimulatorStore((state) => state.speed)
  const stepForward = useSimulatorStore((state) => state.stepForward)
  const stepBackward = useSimulatorStore((state) => state.stepBackward)
  const togglePlay = useSimulatorStore((state) => state.togglePlay)
  const reset = useSimulatorStore((state) => state.reset)
  const setSpeed = useSimulatorStore((state) => state.setSpeed)
  const jumpTo = useSimulatorStore((state) => state.jumpTo)

  const finished = currentStep >= totalSteps

  return (
    <footer className="controlbar" aria-label="模拟器控制">
      <div className="control-progress">
        <div className="control-progress-head">
          <span className="control-progress-title">
            执行序列
            <span className="h-[3px] w-[3px] rounded-full bg-[#3d5878]" />
          </span>
          <span className="control-step">
            {String(currentStep).padStart(2, '0')}
            <span> / {totalSteps}</span>
          </span>
        </div>
        <div className="tick-track" role="group" aria-label="跳转到执行步骤">
          {Array.from({ length: totalSteps }, (_, index) => {
            const step = index + 1
            return (
              <button
                key={step}
                type="button"
                className="tick"
                data-done={step <= currentStep}
                data-current={step === currentStep}
                aria-label={`跳转到第 ${step} 步`}
                title={`第 ${step} 步`}
                onClick={() => jumpTo(step)}
              />
            )
          })}
        </div>
      </div>

      <div className="control-divider" />

      <div className="control-buttons">
        <button
          type="button"
          className="ctrl-btn"
          onClick={stepBackward}
          disabled={currentStep === 0}
          title="回到上一步状态（←）"
        >
          <ChevronLeft size={14} strokeWidth={2} />
          上一步
        </button>

        <button
          type="button"
          className="ctrl-btn ctrl-btn-primary"
          onClick={stepForward}
          disabled={finished}
          title="执行下一条汇编指令（→）"
        >
          下一步
          <ChevronRight size={14} strokeWidth={2.3} />
        </button>

        <button
          type="button"
          className="ctrl-btn ctrl-btn-play"
          data-playing={isPlaying}
          onClick={togglePlay}
          title={isPlaying ? '暂停自动播放（Space）' : '自动播放（Space）'}
        >
          {isPlaying ? (
            <Pause size={13} strokeWidth={2.2} />
          ) : (
            <Play size={13} strokeWidth={2.2} />
          )}
          {isPlaying ? '暂停' : finished ? '重新播放' : '自动播放'}
        </button>

        <button
          type="button"
          className="ctrl-btn ctrl-btn-icon"
          onClick={reset}
          title="重置模拟器（R）"
          aria-label="重置模拟器"
        >
          <RotateCcw size={13} strokeWidth={2} />
        </button>
      </div>

      <div className="control-divider" />

      <div className="speed-control">
        <span className="speed-label">速度</span>
        <div className="speed-group" role="group" aria-label="自动播放速度">
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              className="speed-btn"
              data-active={speed === value}
              onClick={() => setSpeed(value)}
              aria-label={`播放速度 ${value} 倍`}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>

      <div className="control-spacer" />

      <div className="shortcut-hints">
        <span className="shortcut">
          <kbd>←</kbd>
          <kbd>→</kbd>
          步进
        </span>
        <span className="shortcut">
          <kbd>Space</kbd>
          播放
        </span>
        <span className="shortcut">
          <kbd>R</kbd>
          重置
        </span>
      </div>
    </footer>
  )
}
