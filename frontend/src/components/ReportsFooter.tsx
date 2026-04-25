import type { AnalysisResult } from '../api/analysisApi'
import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'
import { generatePdfReport } from '../utils/pdfReport'

type ReportsFooterProps = {
  result?: AnalysisResult | null
  completedAt?: string | null
}

export function ReportsFooter({ result, completedAt }: ReportsFooterProps) {
  return (
    <footer className="reports-footer">
      <div>
        <div className="verified-icon">
          <MaterialIcon name="verified_user" />
        </div>
        <div>
          <p>Report Verified by LabAI Core</p>
          <span>Certification ID: FLX-9920-881-B</span>
        </div>
      </div>
      <div className="reports-footer-actions">
        <Button className="share-link-button">Share Link</Button>
        <Button
          className="reports-download"
          disabled={!result}
          onClick={() => result && generatePdfReport(result, completedAt)}
        >
          Download PDF Report
        </Button>
      </div>
    </footer>
  )
}
