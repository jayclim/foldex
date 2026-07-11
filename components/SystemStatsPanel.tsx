'use client'

import { systemStats } from '../utils/analysisData'

export function SystemStatsPanel() {
  return (
    <section className="glass-panel system-stats-panel">
      {systemStats.map((stat) => (
        <div className="system-stat" key={stat.label}>
          <span>{stat.label}</span>
          <strong className={stat.tone}>{stat.value}</strong>
          {stat.progress ? (
            <div className="stat-track">
              <span
                className={stat.progressTone === 'error' ? 'error' : undefined}
                style={{ width: `${stat.progress}%` }}
              />
            </div>
          ) : null}
        </div>
      ))}
    </section>
  )
}