import type { AnalysisResult } from '../api/analysisApi'
import { MaterialIcon } from './MaterialIcon'
import { clinicalSnippets, reportStats } from '../utils/reportsData'

type ReportStatsSidebarProps = {
  result?: AnalysisResult | null
}

export function ReportStatsSidebar({ result }: ReportStatsSidebarProps) {
  const features = result?.annotations?.features
  const seqFeat = features?.sequence
  const mutFeat = features?.mutation
  const uniprot = result?.annotations?.uniprot
  const gnomad = result?.annotations?.gnomad

  const classComp = seqFeat?.class_composition

  const gnomadFreq = gnomad?.population_frequency
    ? `${(Object.values(gnomad.population_frequency as Record<string, number>)[0]).toExponential(2)} (gnomAD)`
    : 'Not observed in gnomAD'

  const domains = uniprot?.domains?.slice(0, 2).map((d) => d.description).join(', ') ?? 'Domain info unavailable'

  const snippets = result
    ? [
        {
          title: 'Wild Type Function',
          body: result.report?.json?.wild_type?.description ?? uniprot?.function?.[0] ?? 'Function data unavailable.',
        },
        {
          title: 'Functional Domain',
          body: `Domains: ${domains}`,
        },
        {
          title: 'Population Frequency',
          body: gnomadFreq,
        },
      ]
    : clinicalSnippets

  if (!result || !seqFeat) {
    return (
      <aside className="report-stats-sidebar">
        {reportStats.map((stat) => (
          <article className="glass-panel report-stat-card" key={stat.title}>
            {stat.icon ? (
              <div className="report-stat-watermark">
                <MaterialIcon name={stat.icon} />
              </div>
            ) : null}
            <h3>{stat.title}</h3>
            <div className="report-stat-value">
              <strong>{stat.value}</strong>
              <span>{stat.unit}</span>
            </div>
            <div className={`report-stat-trend ${stat.tone}`}>
              <MaterialIcon name={stat.trendIcon} />
              <span>{stat.trend}</span>
            </div>
            {stat.detailLabel ? (
              <div className="wild-type-meter">
                <div>
                  <span>{stat.detailLabel}</span>
                  <span>{stat.detailValue}</span>
                </div>
                <div>
                  <span style={{ width: `${stat.progress}%` }} />
                </div>
              </div>
            ) : null}
            {stat.bars ? (
              <>
                <div className="stability-bars">
                  {stat.bars.map((height, index) => (
                    <span className={index === 2 ? 'active' : undefined} style={{ height: `${height}%` }} key={height + index} />
                  ))}
                </div>
                <p className="impact-caption">Mutation Point Impact Profile</p>
              </>
            ) : null}
          </article>
        ))}
        <article className="glass-panel clinical-context-card">
          <h3>Clinical Context</h3>
          <div>
            {snippets.map((snippet) => (
              <section key={snippet.title}>
                <h4>{snippet.title}</h4>
                <p>{snippet.body}</p>
              </section>
            ))}
          </div>
        </article>
      </aside>
    )
  }

  const hydDelta = mutFeat?.hydropathy_delta ?? 0
  const hydTone = Math.abs(hydDelta) > 1.5 ? 'error' : 'success'

  const bars = classComp
    ? [
        Math.round((classComp.nonpolar ?? 0) * 100),
        Math.round((classComp.polar ?? 0) * 100),
        Math.round(((classComp.positive ?? 0) + (classComp.negative ?? 0)) * 100),
        Math.round((classComp.aromatic ?? 0) * 100),
        Math.round((classComp.special ?? 0) * 100),
      ]
    : []

  const mwKda = seqFeat.molecular_weight_da != null
    ? `${(seqFeat.molecular_weight_da / 1000).toFixed(1)}`
    : '—'

  return (
    <aside className="report-stats-sidebar">
      <article className="glass-panel report-stat-card">
        <div className="report-stat-watermark">
          <MaterialIcon name="science" />
        </div>
        <h3>Sequence Properties</h3>
        <div className="report-stat-value">
          <strong>{mwKda}</strong>
          <span>kDa</span>
        </div>
        <div className={`report-stat-trend ${hydTone}`}>
          <MaterialIcon name={hydDelta >= 0 ? 'trending_up' : 'trending_down'} />
          <span>Hydropathy Δ {hydDelta >= 0 ? '+' : ''}{hydDelta.toFixed(2)}</span>
        </div>
        <div className="wild-type-meter">
          <div>
            <span>Sequence Length</span>
            <span>{seqFeat.length ?? '—'} aa</span>
          </div>
          <div>
            <span style={{ width: `${Math.min(((seqFeat.length ?? 0) / 2000) * 100, 100)}%` }} />
          </div>
        </div>
      </article>

      {bars.length > 0 && (
        <article className="glass-panel report-stat-card">
          <h3>AA Class Composition</h3>
          <div className="report-stat-value">
            <strong>{Math.round((classComp?.nonpolar ?? 0) * 100)}</strong>
            <span>% nonpolar</span>
          </div>
          <div className="report-stat-trend neutral">
            <MaterialIcon name="pie_chart" />
            <span>Polar {Math.round((classComp?.polar ?? 0) * 100)}% · Charged {Math.round(((classComp?.positive ?? 0) + (classComp?.negative ?? 0)) * 100)}%</span>
          </div>
          <div className="stability-bars">
            {bars.map((height, index) => (
              <span className={index === 0 ? 'active' : undefined} style={{ height: `${height}%` }} key={index} />
            ))}
          </div>
          <p className="impact-caption">Nonpolar · Polar · Charged · Aromatic · Special</p>
        </article>
      )}

      <article className="glass-panel clinical-context-card">
        <h3>Clinical Context</h3>
        <div>
          {snippets.map((snippet) => (
            <section key={snippet.title}>
              <h4>{snippet.title}</h4>
              <p>{snippet.body}</p>
            </section>
          ))}
        </div>
      </article>
    </aside>
  )
}
