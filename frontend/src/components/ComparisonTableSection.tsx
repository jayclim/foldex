import { comparisonRows } from '../utils/reportsData'

export function ComparisonTableSection() {
  return (
    <section className="glass-panel comparison-section">
      <header>
        <h2>Wild Type vs. Variant Analysis</h2>
        <div>
          <span>
            <em className="wild-type-dot" /> Wild Type
          </span>
          <span>
            <em className="variant-dot" /> G234D Variant
          </span>
        </div>
      </header>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Wild Type (Gly234)</th>
              <th>Variant (Asp234)</th>
              <th>Delta Value</th>
              <th>Impact Assessment</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
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
    </section>
  )
}
