import { MaterialIcon } from './MaterialIcon'
import { clinicalSnippets, reportStats } from '../utils/reportsData'

export function ReportStatsSidebar() {
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
          {clinicalSnippets.map((snippet) => (
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
