'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AnalysisResult } from '../api-client/analysisApi'
import { submitAnalysis } from '../api-client/analysisApi'
import * as store from '../store/analysisStore'
import type { Phase } from '../store/analysisStore'
import { LiveAnalysis } from '../components/LiveAnalysis'
import { QuickIntake } from '../components/QuickIntake'
import { RecentVariants } from '../components/RecentVariants'
import { VariantReportPanel } from '../components/VariantReportPanel'
import { DashboardHeader } from '../layouts/DashboardHeader'
import { FloatingActionButton } from '../layouts/FloatingActionButton'
import { AppLayout } from '../layouts/AppLayout'
import { MaterialIcon } from '../components/MaterialIcon'
import './DashboardPage.css'

export function DashboardPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>(store.getState().phase)
  const [jobId, setJobId] = useState<string | null>(store.getState().jobId)
  const [result, setResult] = useState<AnalysisResult | null>(store.getState().result)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    return store.subscribe(() => {
      const s = store.getState()
      setPhase(s.phase)
      setJobId(s.jobId)
      setResult(s.result)
    })
  }, [])

  async function handleSubmit(gene: string, mutation: string) {
    setSubmitError(null)
    try {
      const { job_id, status, result } = await submitAnalysis(gene, mutation)
      if (status === 'completed' && result) {
        store.setJobCompleted(result)
        return
      }
      store.setJobStarted(job_id)
    } catch {
      setSubmitError('Could not reach the analysis API. Try again, or enable demo mode for the public resume deployment.')
    }
  }

  function handleComplete(analysisResult: AnalysisResult) {
    store.setJobCompleted(analysisResult)
  }

  function handleError(err: string) {
    store.setJobFailed(err)
    setSubmitError(`Analysis failed: ${err}`)
  }

  function handleReset() {
    store.reset()
  }

  if (phase === 'input') {
    return (
      <AppLayout activePage="Analysis" header={<DashboardHeader />}>
        <div className="dashboard-input-phase">
          <div style={{ width: '100%', maxWidth: '560px' }}>
            <section className="demo-intro">
              <p>Research demo</p>
              <h1>Turn one genetic variant into an evidence-backed review packet.</h1>
              <span>
                Paste a gene mutation or upload a sample report. FoldEx parses the variant, gathers evidence, compares similar variants, and produces a clinician-reviewable report.
              </span>
            </section>
            <QuickIntake onSubmit={handleSubmit} />
            {submitError && <p className="intake-error" style={{ marginTop: '12px' }}>{submitError}</p>}
          </div>
        </div>
      </AppLayout>
    )
  }

  if (phase === 'loading') {
    return (
      <AppLayout activePage="Analysis" header={<DashboardHeader />}>
        <div className="dashboard-loading-phase">
          <div style={{ width: '100%', maxWidth: '560px' }}>
            <LiveAnalysis
              jobId={jobId}
              onComplete={handleComplete}
              onError={handleError}
            />
            {submitError && <p className="intake-error" style={{ marginTop: '12px' }}>{submitError}</p>}
          </div>
        </div>
      </AppLayout>
    )
  }

  // phase === 'results'
  return (
    <AppLayout
      activePage="Analysis"
      header={<DashboardHeader />}
      floatingAction={<FloatingActionButton />}
    >
      <div className="results-action-row">
        <button className="reset-btn" onClick={handleReset}>
          <MaterialIcon name="refresh" />
          New Analysis
        </button>
        <button onClick={() => router.push('/reports')}>
          <MaterialIcon name="analytics" />
          Full Report
        </button>
      </div>

      <div className="dashboard-grid">
        <section className="left-stack">
          <LiveAnalysis completed />
          <RecentVariants similarVariants={result?.structures?.similar_variants} />
        </section>

        <VariantReportPanel result={result} />
      </div>
    </AppLayout>
  )
}
