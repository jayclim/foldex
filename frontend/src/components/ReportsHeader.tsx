import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'

export function ReportsHeader() {
  return (
    <header className="reports-header">
      <div className="reports-title">
        <div className="reports-meta">
          <span>Variant ID: BRC1-G234D</span>
          <em>Last Computed: 24 Oct 2023, 14:22 GMT</em>
        </div>
        <h1>Human BRCA1 Missense Mutation</h1>
        <p>
          Functional analysis of G234D substitution in the BRCT domain. Structural integrity
          predicted using AlphaFold2 multi-state modeling.
        </p>
      </div>

      <div className="glass-panel significance-card">
        <div className="significance-card-header">
          <span>Clinical Significance</span>
          <MaterialIcon name="warning" />
        </div>
        <div>
          <strong>PATHOGENIC</strong>
          <div className="significance-meter">
            <span />
            <em>94.2%</em>
          </div>
        </div>
        <p>Confidence level based on structural destabilization &amp; binding affinity delta.</p>
      </div>

      <Button className="reports-download reports-download-top">
        <MaterialIcon name="download" />
        Download PDF Report
      </Button>
    </header>
  )
}
