import type { SimilarVariantStructure } from '../api/analysisApi'
import { similarVariants as mockVariants } from '../utils/reportsData'

function clinSigToClassification(sig?: string | null): string {
  if (!sig) return 'VUS'
  if (/pathogenic/i.test(sig)) return 'PATHOGENIC'
  if (/benign/i.test(sig)) return 'BENIGN'
  return 'VUS'
}

function clinSigToTone(sig?: string | null): string {
  if (!sig) return 'neutral'
  if (/pathogenic/i.test(sig)) return 'error'
  if (/benign/i.test(sig)) return 'success'
  return 'neutral'
}

type SimilarVariantsSectionProps = {
  variants?: SimilarVariantStructure[] | null
}

export function SimilarVariantsSection({ variants }: SimilarVariantsSectionProps) {
  const items = variants?.length
    ? variants.slice(0, 4).map((sv) => ({
        id: sv.variant?.name ?? sv.variant?.gene ?? 'Unknown',
        classification: clinSigToClassification(sv.variant?.clinical_significance),
        tone: clinSigToTone(sv.variant?.clinical_significance),
        similarity: `${Math.round((sv.variant?.similarity_score ?? 0) * 100)}%`,
        description: sv.variant?.description
          ?? sv.variant?.similarity_reasons?.join('; ')
          ?? 'Similar variant with overlapping features.',
      }))
    : mockVariants

  return (
    <section className="similar-variants-section">
      <div className="reports-section-heading">
        <h2>Similar Known Variants</h2>
        <span />
      </div>
      <div className="similar-variant-grid">
        {items.map((variant) => (
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
