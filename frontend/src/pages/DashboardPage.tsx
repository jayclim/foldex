import { useEffect, useState } from 'react'
import type { AnalysisResult } from '../api/analysisApi'
import { submitAnalysis } from '../api/analysisApi'
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

function navigate(href: string) {
  window.history.pushState({}, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function DashboardPage() {
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
      const { job_id } = await submitAnalysis(gene, mutation)
      store.setJobStarted(job_id)
    } catch {
      setSubmitError('Could not reach the analysis server. Make sure the backend is running on port 8000.')
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
        <button onClick={() => navigate('/reports')}>
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
