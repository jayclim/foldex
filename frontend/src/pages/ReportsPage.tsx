import { ComparisonTableSection } from '../components/ComparisonTableSection'
import { ReportsFooter } from '../components/ReportsFooter'
import { ReportsHeader } from '../components/ReportsHeader'
import { ReportStatsSidebar } from '../components/ReportStatsSidebar'
import { ReportStructurePanel } from '../components/ReportStructurePanel'
import { SimilarVariantsSection } from '../components/SimilarVariantsSection'
import { AppLayout } from '../layouts/AppLayout'
import './ReportsPage.css'

export function ReportsPage() {
  return (
    <AppLayout activePage="Reports" mainClassName="reports-main">
      <div className="reports-page">
        <ReportsHeader />

        <div className="reports-bento">
          <ReportStructurePanel />
          <ReportStatsSidebar />
        </div>

        <SimilarVariantsSection />
        <ComparisonTableSection />
        <ReportsFooter />
      </div>
    </AppLayout>
  )
}
