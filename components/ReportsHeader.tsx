'use client'

import type { AnalysisResult } from '../api-client/analysisApi'
import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'
import { generatePdfReport } from '../utils/pdfReport'

function extractClinicalSignificance(result: AnalysisResult): { sig: string; confidence: string | null; tone: string } {
  const clinvar = result.report?.json?.classification_summary?.clinvar?.[0]
  const alphaMissense = result.annotations?.alpha_missense?.predictions?.[0]

  if (clinvar?.clinical_significance) {
    const sig = clinvar.clinical_significance
    const tone = /pathogenic/i.test(sig) ? 'danger' : /benign/i.test(sig) ? 'success' : 'neutral'
    const confidence = /conflicting|uncertain/i.test(sig) ? 'Uncertain' : 'Confident'
    return { sig: sig.toUpperCase(), confidence, tone }
  }

  if (alphaMissense) {
    const sig = alphaMissense.prediction.replace('likely_', 'Likely ').replace('_', ' ')
    return {
      sig: sig.toUpperCase(),
      confidence: alphaMissense.prediction === 'ambiguous' ? 'Uncertain' : 'Confident',
      tone: alphaMissense.prediction === 'likely_pathogenic' ? 'danger'
        : alphaMissense.prediction === 'likely_benign' ? 'success' : 'neutral',
    }
  }

  return { sig: 'UNCERTAIN SIGNIFICANCE', confidence: null, tone: 'neutral' }
}

type ReportsHeaderProps = {
  result?: AnalysisResult | null
  completedAt?: string | null
}

export function ReportsHeader({ result, completedAt }: ReportsHeaderProps) {
  if (!result) {
    return (
      <header className="reports-header">
        <div className="reports-title">
          <div className="reports-meta">
            <span>No analysis loaded</span>
          </div>
          <h1>No Variant Report</h1>
          <p>Run an analysis from the Analysis page to generate a report.</p>
        </div>
      </header>
    )
  }

  const { sig, confidence, tone } = extractClinicalSignificance(result)
  const displayName = result.variant?.display_name ?? `${result.variant?.gene ?? ''}`
  const gene = result.variant?.gene ?? ''
  const protein = result.report?.json?.wild_type?.protein ?? ''
  const description = result.report?.json?.wild_type?.description ?? result.report?.json?.unknown_variant?.description ?? ''

  const computedAt = completedAt
    ? new Date(completedAt).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      })
    : null

  return (
    <header className="reports-header">
      <div className="reports-title">
        <div className="reports-title-top">
          <div className="reports-meta">
            <span>Variant: {displayName}</span>
            {computedAt && <em>Last Computed: {computedAt}</em>}
          </div>
          <Button
            className="reports-download reports-download-top"
            onClick={() => generatePdfReport(result, completedAt)}
          >
            <MaterialIcon name="download" />
            Download PDF Report
          </Button>
        </div>
        <h1>{gene}{protein ? ` — ${protein}` : ' Variant Analysis'}</h1>
        <p>{description}</p>
      </div>

      <div className="glass-panel significance-card">
        <div className={`significance-card-header ${tone}`}>
          <span>Clinical Significance</span>
          <MaterialIcon name={tone === 'danger' ? 'warning' : tone === 'success' ? 'check_circle' : 'help'} />
        </div>
        <div>
          <strong className={tone}>{sig}</strong>
          {confidence && (
            <div className="significance-confidence">
              <em className={tone}>{confidence}</em>
            </div>
          )}
        </div>
        <p>Based on ClinVar assertions and AlphaMissense structural analysis.</p>
      </div>
    </header>
  )
}