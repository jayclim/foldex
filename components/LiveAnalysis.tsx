'use client'

import { useEffect, useRef, useState } from 'react'
import type { AnalysisResult } from '../api-client/analysisApi'
import { pollJob } from '../api-client/analysisApi'
import { MaterialIcon } from './MaterialIcon'

type Step = {
  label: string
  progress: number
  tone: string
  value: string
}

const PIPELINE_STEPS = [
  { label: 'SEQUENCE_LOOKUP', tone: 'green' },
  { label: 'STRUCTURE_PREDICTION', tone: 'cyan' },
  { label: 'VARIANT_ANNOTATION', tone: 'cyan' },
  { label: 'REPORT_SYNTHESIS', tone: 'green' },
]

function buildSteps(jobStatus: string | null, elapsed: number): Step[] {
  if (!jobStatus || jobStatus === 'queued') {
    return PIPELINE_STEPS.map((s, i) => ({
      ...s,
      progress: i === 0 ? 15 : 0,
      value: i === 0 ? '15%' : 'Queued',
    }))
  }

  if (jobStatus === 'completed') {
    return PIPELINE_STEPS.map((s) => ({ ...s, progress: 100, value: '100%' }))
  }

  if (jobStatus === 'failed') {
    return PIPELINE_STEPS.map((s, i) => ({ ...s, progress: i === 0 ? 100 : 0, value: i === 0 ? '100%' : 'Failed' }))
  }

  // running: simulate progress based on elapsed seconds
  const phaseSeconds = [10, 60, 30, 20]
  let accumulated = 0
  return PIPELINE_STEPS.map((s, i) => {
    const phaseDuration = phaseSeconds[i]
    const phaseStart = accumulated
    accumulated += phaseDuration

    let progress: number
    if (elapsed >= accumulated) {
      progress = 95
    } else if (elapsed <= phaseStart) {
      progress = 0
    } else {
      progress = Math.round(((elapsed - phaseStart) / phaseDuration) * 95)
    }

    return { ...s, progress, value: progress > 0 ? `${progress}%` : 'Pending' }
  })
}

type LiveAnalysisProps = {
  jobId?: string | null
  onComplete?: (result: AnalysisResult) => void
  onError?: (err: string) => void
  completed?: boolean
}

export function LiveAnalysis({ jobId, onComplete, onError, completed }: LiveAnalysisProps) {
  const [steps, setSteps] = useState<Step[]>(() => buildSteps(null, 0))
  const [overallPct, setOverallPct] = useState(0)
  const startTimeRef = useRef<number>(Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (completed) {
      const done = buildSteps('completed', 0)
      setSteps(done)
      setOverallPct(100)
      return
    }

    if (!jobId) return

    startTimeRef.current = Date.now()

    async function tick() {
      const elapsed = (Date.now() - startTimeRef.current) / 1000
      let jobStatus = 'running'

      try {
        const job = await pollJob(jobId!)
        jobStatus = job.status

        if (job.status === 'completed' && job.result) {
          const done = buildSteps('completed', 0)
          setSteps(done)
          setOverallPct(100)
          if (intervalRef.current) clearInterval(intervalRef.current)
          onComplete?.(job.result)
          return
        }

        if (job.status === 'failed') {
          if (intervalRef.current) clearInterval(intervalRef.current)
          onError?.(job.error ?? 'Analysis failed')
          return
        }
      } catch {
        // network hiccup — keep polling
      }

      const updated = buildSteps(jobStatus, elapsed)
      setSteps(updated)
      const avg = updated.reduce((s, r) => s + r.progress, 0) / updated.length
      setOverallPct(Math.round(avg))
    }

    tick()
    intervalRef.current = setInterval(tick, 2000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [jobId, completed, onComplete, onError])

  return (
    <div className="glass-panel analysis-panel">
      <h3>
        <span>
          <MaterialIcon name="settings_heart" />
          Live Analysis
        </span>
        <em>{completed ? '100% COMPLETED' : `${overallPct}% COMPLETED`}</em>
      </h3>
      <div className="progress-stack">
        {steps.map((step) => (
          <div className="progress-row" key={step.label}>
            <div>
              <span>{step.label}</span>
              <span>{step.value}</span>
            </div>
            <div className="progress-track">
              <span
                className={`progress-fill ${step.tone}`}
                style={{ width: `${step.progress}%`, transition: 'width 800ms ease' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}