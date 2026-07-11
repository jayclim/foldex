'use client'

import { useEffect, useState } from 'react'
import type { SimilarVariantStructure } from '../api-client/analysisApi'
import { similarVariants as mockVariants } from '../utils/reportsData'
import { Mol3DViewer } from './Mol3DViewer'
import { MaterialIcon } from './MaterialIcon'
import { Button } from './Button'

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

type CardItem = {
  id: string
  classification: string
  tone: string
  similarity: string
  description: string
  source: SimilarVariantStructure | null
}

export function SimilarVariantsSection({ variants }: SimilarVariantsSectionProps) {
  const [selected, setSelected] = useState<CardItem | null>(null)

  const items: CardItem[] = variants?.length
    ? variants.slice(0, 4).map((sv) => ({
        id: sv.variant?.name ?? sv.variant?.gene ?? 'Unknown',
        classification: clinSigToClassification(sv.variant?.clinical_significance),
        tone: clinSigToTone(sv.variant?.clinical_significance),
        similarity: `${Math.round((sv.variant?.similarity_score ?? 0) * 100)}%`,
        description: sv.variant?.description
          ?? sv.variant?.similarity_reasons?.join('; ')
          ?? 'Similar variant with overlapping features.',
        source: sv,
      }))
    : mockVariants.map((m) => ({ ...m, source: null }))

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const selectedSource = selected?.source ?? null
  const selectedPdb = selectedSource?.structure?.pdb ?? null

  return (
    <section className="similar-variants-section">
      <div className="reports-section-heading">
        <h2>Similar Known Variants</h2>
        <span />
      </div>
      <div className="similar-variant-grid">
        {items.map((variant) => (
          <article
            className={`glass-panel similar-variant-card ${variant.tone}`}
            key={variant.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelected(variant)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSelected(variant)
              }
            }}
          >
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

      {selected && (
        <div
          className="similar-variant-modal-backdrop"
          onClick={() => setSelected(null)}
          role="presentation"
        >
          <div
            className={`glass-panel similar-variant-modal ${selected.tone}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`3D structure for ${selected.id}`}
          >
            <Button
              className="similar-variant-modal-close"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              <MaterialIcon name="close" />
            </Button>

            <div className="similar-variant-modal-viewer">
              {selectedPdb ? (
                <Mol3DViewer pdbData={selectedPdb} defaultScheme="ss" className="mol3d-canvas" />
              ) : (
                <div className="similar-variant-modal-empty">
                  <MaterialIcon name="science_off" />
                  <p>No 3D structure available for this variant.</p>
                </div>
              )}
            </div>

            <aside className="similar-variant-modal-info">
              <header>
                <span className="similar-variant-modal-id">{selected.id}</span>
                <em className={`similar-variant-modal-badge ${selected.tone}`}>
                  {selected.classification}
                </em>
              </header>

              <dl className="similar-variant-modal-meta">
                <div>
                  <dt>Similarity</dt>
                  <dd>{selected.similarity}</dd>
                </div>
                {selectedSource?.variant?.clinical_significance && (
                  <div>
                    <dt>Clinical significance</dt>
                    <dd>{selectedSource.variant.clinical_significance}</dd>
                  </div>
                )}
                {selectedSource?.variant?.review_status && (
                  <div>
                    <dt>Review status</dt>
                    <dd>{selectedSource.variant.review_status}</dd>
                  </div>
                )}
                {selectedSource?.variant?.source && (
                  <div>
                    <dt>Source</dt>
                    <dd>{selectedSource.variant.source}</dd>
                  </div>
                )}
              </dl>

              <section className="similar-variant-modal-description">
                <h3>Clinical description</h3>
                <p>
                  {selectedSource?.variant?.description
                    ?? selected.description
                    ?? 'No clinical description available.'}
                </p>
              </section>

              {selectedSource?.variant?.similarity_reasons?.length ? (
                <section className="similar-variant-modal-reasons">
                  <h3>Why it&apos;s similar</h3>
                  <ul>
                    {selectedSource.variant.similarity_reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </aside>
          </div>
        </div>
      )}
    </section>
  )
}