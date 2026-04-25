import { LiveAnalysis } from '../components/LiveAnalysis'
import { QuickIntake } from '../components/QuickIntake'
import { RecentVariants } from '../components/RecentVariants'
import { VariantReportPanel } from '../components/VariantReportPanel'
import { DashboardHeader } from '../layouts/DashboardHeader'
import { FloatingActionButton } from '../layouts/FloatingActionButton'
import { AppLayout } from '../layouts/AppLayout'
import './DashboardPage.css'

export function DashboardPage() {
  return (
    <AppLayout
      activePage="Dashboard"
      header={<DashboardHeader />}
      floatingAction={<FloatingActionButton />}
    >
      <div className="dashboard-grid">
        <section className="left-stack">
          <QuickIntake />
          <LiveAnalysis />
          <RecentVariants />
        </section>

        <VariantReportPanel />
      </div>
    </AppLayout>
  )
}
