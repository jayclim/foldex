import { useEffect, useState } from 'react'
import type { AnalysisResult } from '../api/analysisApi'
import * as store from '../store/analysisStore'
import { ComparisonTableSection } from '../components/ComparisonTableSection'
import { ReportsFooter } from '../components/ReportsFooter'
import { ReportsHeader } from '../components/ReportsHeader'
import { ReportStatsSidebar } from '../components/ReportStatsSidebar'
import { ReportStructurePanel } from '../components/ReportStructurePanel'
import { SimilarVariantsSection } from '../components/SimilarVariantsSection'
import { AppLayout } from '../layouts/AppLayout'
import './ReportsPage.css'

export function ReportsPage() {
  const [result, setResult] = useState<AnalysisResult | null>(store.getState().result)
  const [completedAt, setCompletedAt] = useState<string | null>(store.getState().completedAt)

  useEffect(() => {
    return store.subscribe(() => {
      const s = store.getState()
      setResult(s.result)
      setCompletedAt(s.completedAt)
    })
  }, [])

  return (
    <AppLayout activePage="Reports" mainClassName="reports-main">
      <div className="reports-page">
        <ReportsHeader result={result} completedAt={completedAt} />

        <div className="reports-bento">
          <ReportStructurePanel result={result} />
          <ReportStatsSidebar result={result} />
        </div>

        <SimilarVariantsSection variants={result?.structures?.similar_variants} />
        <ComparisonTableSection result={result} />
        <ReportsFooter result={result} completedAt={completedAt} />
      </div>
    </AppLayout>
  )
}
