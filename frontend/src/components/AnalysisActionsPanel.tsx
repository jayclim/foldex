import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'

export function AnalysisActionsPanel() {
  return (
    <section className="glass-panel analysis-actions-panel">
      <header>
        <div>
          <h4>ANALYSIS ACTIONS</h4>
          <p>MANUAL OVERRIDE AVAILABLE</p>
        </div>
        <MaterialIcon name="shield" />
      </header>
      <div className="analysis-action-buttons">
        <Button className="pause-button">PAUSE PROCESS</Button>
        <Button className="report-outline-button">GENERATE REPORT</Button>
      </div>
    </section>
  )
}
