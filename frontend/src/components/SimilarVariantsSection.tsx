import { similarVariants } from '../utils/reportsData'

export function SimilarVariantsSection() {
  return (
    <section className="similar-variants-section">
      <div className="reports-section-heading">
        <h2>Similar Known Variants</h2>
        <span />
      </div>
      <div className="similar-variant-grid">
        {similarVariants.map((variant) => (
          <article className={`glass-panel similar-variant-card ${variant.tone}`} key={variant.id}>
            <div className="similar-card-top">
              <span>{variant.id}</span>
              <em>{variant.classification}</em>
            </div>
            <div className="similarity-score">
              <strong>{variant.similarity}</strong>
              <span>Similarity</span>
            </div>
            <p>{variant.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
