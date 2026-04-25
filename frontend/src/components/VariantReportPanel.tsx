import type { AnalysisResult } from '../api/analysisApi'
import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'
import { dataStream, variantMetrics } from '../utils/dashboardData'
import { ProteinViewer } from './ProteinViewer'
import { getGnomadAlleleFrequency } from '../utils/gnomad'

function navigate(href: string) {
  window.history.pushState({}, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function extractMetrics(result: AnalysisResult) {
  const ann = result.annotations
  const report = result.report?.json

  const alphaMissense = ann?.alpha_missense?.predictions?.[0]
  const clinvar = report?.classification_summary?.clinvar?.[0]
  const gnomad = ann?.gnomad
  const mutation = result.variant?.mutation

  const gnomadAf = getGnomadAlleleFrequency(gnomad)
  const afValue = gnomadAf != null
    ? `${(gnomadAf * 100).toExponential(2)}%`
    : 'Not in gnomAD'

  const amScore = alphaMissense
    ? `${alphaMissense.score.toFixed(3)} (${alphaMissense.prediction.replace('likely_', '')})`
    : 'N/A'

  const amTone = alphaMissense?.prediction === 'likely_pathogenic' ? 'danger'
    : alphaMissense?.prediction === 'likely_benign' ? 'success' : 'cyan'

  const clinSig = clinvar?.clinical_significance ?? 'Unknown'
  const clinTone = /pathogenic/i.test(clinSig) ? 'danger' : /benign/i.test(clinSig) ? 'success' : 'cyan'

  let position = mutation?.protein_position
    ? `${mutation.reference_aa ?? '?'}${mutation.protein_position}${mutation.alternate_aa ?? '?'}`
    : result.variant?.display_name ?? 'N/A'

  const posParts = position.split(' ')
  if (posParts.length === 2 && posParts[0].toUpperCase() === posParts[1].toUpperCase()) {
    position = posParts[0]
  }

  return [
    { label: 'ALLELE FREQUENCY', value: afValue, note: 'gnomAD population', tone: 'cyan' },
    { label: 'ALPHAMISSENSE', value: amScore, note: 'Pathogenicity score', tone: amTone },
    { label: 'CLINVAR RATING', value: clinSig.toUpperCase(), note: clinvar?.review_status ?? '', tone: clinTone },
    { label: 'POSITION', value: position, note: mutation?.cdna_hgvs ?? '', tone: 'cyan' },
  ]
}

function extractStream(result: AnalysisResult): [string, string][] {
  const mut = result.variant?.mutation
  return [
    ['GENE', result.variant?.gene ?? '—'],
    ['CDNA', mut?.cdna_hgvs ?? '—'],
    ['PROTEIN', mut?.protein_hgvs ?? '—'],
    ['POSITION', mut?.protein_position ? String(mut.protein_position) : '—'],
  ]
}

type VariantReportPanelProps = {
  result?: AnalysisResult | null
}

export function VariantReportPanel({ result }: VariantReportPanelProps) {
  const metrics = result ? extractMetrics(result) : variantMetrics
  const stream = result ? extractStream(result) : dataStream
  const pdbData = result?.structures?.unknown_variant?.pdb ?? null

  let variantTitle = result
    ? (result.variant?.display_name ?? `${result.variant?.gene ?? ''}`)
    : 'TP53:c.743G>A'

  const titleParts = variantTitle.split(' ')
  if (titleParts.length === 2 && titleParts[0].toUpperCase() === titleParts[1].toUpperCase()) {
    variantTitle = titleParts[0]
  }

  const variantDesc = result
    ? (result.report?.json?.unknown_variant?.description ?? result.report?.json?.wild_type?.description ?? '')
    : 'Missense mutation in DNA-binding domain. Likely compromise of protein structural integrity confirmed by multi-model synthesis.'

  const clinvar = result?.report?.json?.classification_summary?.clinvar?.[0]
  const isCritical = clinvar
    ? /pathogenic/i.test(clinvar.clinical_significance ?? '')
    : true

  return (
    <section className="glass-panel report-panel">
      <svg
        className="dna-wave"
        preserveAspectRatio="none"
        viewBox="0 0 800 600"
        aria-hidden="true"
      >
        <path
          d="M0,300 C150,100 250,500 400,300 C550,100 650,500 800,300"
          fill="none"
          stroke="#00daf3"
          strokeWidth="2"
        />
        <path
          d="M0,320 C150,120 250,520 400,320 C550,120 650,520 800,320"
          fill="none"
          stroke="#08f1a9"
          strokeWidth="2"
        />
      </svg>

      <div className="report-content">
        <div className="report-summary">
          <div>
            <div className="critical-pill">
              <span />
              {isCritical ? 'Critical Variant Detected' : 'Variant Analysis Complete'}
            </div>
            <h1>{variantTitle}</h1>
            <p>{variantDesc}</p>
          </div>

          <div className="metric-grid">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <p>{metric.label}</p>
                <strong className={metric.tone}>{metric.value}</strong>
                <small>{metric.note}</small>
              </article>
            ))}
          </div>

          <div className="report-actions">
            <Button className="report-button" onClick={() => navigate('/reports')}>
              <MaterialIcon name="description" />
              Full Clinical Report
            </Button>
            <Button className="icon-button" aria-label="Share report">
              <MaterialIcon name="share" />
            </Button>
          </div>
        </div>

        <ProteinViewer pdbData={pdbData} label={variantTitle} />
      </div>

      <footer className="data-stream">
        {stream.map(([label, value]) => (
          <div key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </div>
        ))}
      </footer>
    </section>
  )
}
