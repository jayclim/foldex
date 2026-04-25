import { diagnosticLogs } from '../utils/analysisData'

export function DiagnosticLogPanel() {
  return (
    <section className="glass-panel diagnostic-panel">
      <header>
        <span>DIAGNOSTIC LOG</span>
        <span>ENCRYPTED_LINK_ESTABLISHED</span>
      </header>
      <div className="diagnostic-log">
        {diagnosticLogs.map((log) => (
          <p key={`${log.time}-${log.message}`}>
            <span className="log-time">[{log.time}]</span>{' '}
            <span className={`log-level ${log.tone}`}>{log.level}:</span> {log.message}
          </p>
        ))}
      </div>
    </section>
  )
}
