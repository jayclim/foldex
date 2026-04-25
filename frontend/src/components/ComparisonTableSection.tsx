import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AnalysisResult } from '../api/analysisApi'
import { comparisonRows as mockRows } from '../utils/reportsData'

type CompareRow = {
  parameter: string
  wildType: string
  variant: string
  delta: string
  deltaTone: string
  impact: string
  impactTone: string
}

function buildRows(result: AnalysisResult): CompareRow[] {
  const features = result.annotations?.features
  const mut = features?.mutation

  if (!mut) return mockRows

  const rows: CompareRow[] = []

  if (mut.reference_properties && mut.alternate_properties) {
    const refClass = mut.reference_properties.class ?? '—'
    const altClass = mut.alternate_properties.class ?? '—'
    const classChanged = mut.class_change
    rows.push({
      parameter: 'Amino Acid Class',
      wildType: `${mut.reference_aa ?? '?'} (${refClass})`,
      variant: `${mut.alternate_aa ?? '?'} (${altClass})`,
      delta: classChanged ? 'Changed' : 'Same',
      deltaTone: classChanged ? 'error' : 'success',
      impact: classChanged ? 'CLASS CHANGE' : 'CONSERVATIVE',
      impactTone: classChanged ? 'error' : 'success',
    })

    const hydDelta = mut.hydropathy_delta ?? 0
    rows.push({
      parameter: 'Hydropathy (KD)',
      wildType: mut.reference_properties.hydropathy.toFixed(2),
      variant: mut.alternate_properties.hydropathy.toFixed(2),
      delta: hydDelta >= 0 ? `+${hydDelta.toFixed(2)}` : hydDelta.toFixed(2),
      deltaTone: Math.abs(hydDelta) > 1.5 ? 'error' : 'success',
      impact: Math.abs(hydDelta) > 2 ? 'SEVERE' : Math.abs(hydDelta) > 1 ? 'MODERATE' : 'MINIMAL',
      impactTone: Math.abs(hydDelta) > 2 ? 'error' : Math.abs(hydDelta) > 1 ? 'warn' : 'success',
    })

    const massDelta = mut.mass_delta_da ?? 0
    rows.push({
      parameter: 'Residue Mass (Da)',
      wildType: `${mut.reference_properties.mass.toFixed(1)} Da`,
      variant: `${mut.alternate_properties.mass.toFixed(1)} Da`,
      delta: massDelta >= 0 ? `+${massDelta.toFixed(1)}` : massDelta.toFixed(1),
      deltaTone: Math.abs(massDelta) > 30 ? 'error' : 'success',
      impact: Math.abs(massDelta) > 50 ? 'STERIC CHANGE' : Math.abs(massDelta) > 20 ? 'MODERATE' : 'MINIMAL',
      impactTone: Math.abs(massDelta) > 50 ? 'error' : Math.abs(massDelta) > 20 ? 'warn' : 'neutral',
    })
  }

  if (mut.protein_position != null && features?.sequence?.length) {
    const posFrac = ((mut.protein_position / features.sequence.length) * 100).toFixed(0)
    rows.push({
      parameter: 'Sequence Position',
      wildType: `Residue ${mut.protein_position}`,
      variant: `${posFrac}% from N-term`,
      delta: '—',
      deltaTone: 'neutral',
      impact: 'POSITIONAL',
      impactTone: 'neutral',
    })
  }

  if (features?.sequence) {
    const mw = features.sequence.molecular_weight_da
    const hydro = features.sequence.average_hydropathy
    if (mw != null) {
      rows.push({
        parameter: 'Molecular Weight',
        wildType: `${(mw / 1000).toFixed(1)} kDa`,
        variant: '(mutant)',
        delta: '—',
        deltaTone: 'neutral',
        impact: 'STRUCTURAL',
        impactTone: 'neutral',
      })
    }
    if (hydro != null) {
      rows.push({
        parameter: 'Avg. Hydropathy',
        wildType: hydro.toFixed(3),
        variant: '—',
        delta: '—',
        deltaTone: 'neutral',
        impact: hydro < 0 ? 'HYDROPHILIC' : 'HYDROPHOBIC',
        impactTone: 'neutral',
      })
    }
  }

  return rows.length ? rows : mockRows
}

type ComparisonTableSectionProps = {
  result?: AnalysisResult | null
}

export function ComparisonTableSection({ result }: ComparisonTableSectionProps) {
  const rows = result ? buildRows(result) : mockRows
  const refAa = result?.annotations?.features?.mutation?.reference_aa ?? 'Wild Type'
  const altAa = result?.annotations?.features?.mutation?.alternate_aa ?? 'Variant'
  const pos = result?.annotations?.features?.mutation?.protein_position

  const reportJson = result?.report?.json
  const wildDesc = reportJson?.wild_type?.description
  const variantDesc = reportJson?.unknown_variant?.description
  const markdown = result?.report?.markdown
  const hasNarrative = Boolean(wildDesc || variantDesc || markdown)

  return (
    <section className="glass-panel comparison-section">
      <header>
        <h2>Wild Type vs. Variant Analysis</h2>
        <div>
          <span>
            <em className="wild-type-dot" /> Wild Type {refAa}{pos ?? ''}
          </span>
          <span>
            <em className="variant-dot" /> {altAa}{pos ?? ''} Variant
          </span>
        </div>
      </header>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Wild Type ({refAa})</th>
              <th>Variant ({altAa})</th>
              <th>Delta Value</th>
              <th>Impact Assessment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.parameter}>
                <td>{row.parameter}</td>
                <td>{row.wildType}</td>
                <td>{row.variant}</td>
                <td className={row.deltaTone}>{row.delta}</td>
                <td>
                  <span className={`impact-badge ${row.impactTone}`}>{row.impact}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasNarrative && (
        <div className="comparison-narrative">
          {(wildDesc || variantDesc) && (
            <div className="comparison-narrative-grid">
              <article>
                <h3><em className="wild-type-dot" /> Wild Type</h3>
                <p>{wildDesc ?? '—'}</p>
              </article>
              <article>
                <h3><em className="variant-dot" /> Variant</h3>
                <p>{variantDesc ?? '—'}</p>
              </article>
            </div>
          )}
          {markdown && (
            <details className="comparison-narrative-full" open>
              <summary>Full report</summary>
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
