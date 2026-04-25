import { AnalysisActionsPanel } from '../components/AnalysisActionsPanel'
import { AnalysisHeader } from '../components/AnalysisHeader'
import { AnalysisProteinPreview } from '../components/AnalysisProteinPreview'
import { DiagnosticLogPanel } from '../components/DiagnosticLogPanel'
import { SequenceAlignmentPanel } from '../components/SequenceAlignmentPanel'
import { SystemStatsPanel } from '../components/SystemStatsPanel'
import { AnalysisFloatingActionButton } from '../layouts/AnalysisFloatingActionButton'
import { AppLayout } from '../layouts/AppLayout'
import './AnalysisPage.css'

export function AnalysisPage() {
  return (
    <AppLayout
      activePage="Analysis"
      floatingAction={<AnalysisFloatingActionButton />}
      mainClassName="analysis-main"
    >
      <div className="analysis-page">
        <AnalysisHeader />

        <div className="analysis-grid">
          <SequenceAlignmentPanel />
          <AnalysisProteinPreview />
          <DiagnosticLogPanel />
          <SystemStatsPanel />
          <AnalysisActionsPanel />
        </div>
      </div>
    </AppLayout>
  )
}
