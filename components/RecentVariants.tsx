'use client'

import type { SimilarVariantStructure } from '../api-client/analysisApi'
import { Button } from './Button'
import { MaterialIcon } from './MaterialIcon'
import { recentVariants } from '../utils/dashboardData'

function clinSigTone(sig?: string | null): string {
  if (!sig) return 'neutral'
  if (/pathogenic/i.test(sig)) return 'danger'
  if (/benign/i.test(sig)) return 'success'
  return 'neutral'
}

type RecentVariantsProps = {
  similarVariants?: SimilarVariantStructure[] | null
}

export function RecentVariants({ similarVariants }: RecentVariantsProps) {
  const items = similarVariants?.length
    ? similarVariants.slice(0, 5).map((sv) => ({
        variant: sv.variant?.name ?? sv.variant?.gene ?? 'Unknown',
        detail: [sv.variant?.gene, (sv.variant?.mutation as { protein_hgvs?: string } | null)?.protein_hgvs ?? sv.variant?.alternate_aa]
          .filter(Boolean)
          .join(' | '),
        status: sv.variant?.clinical_significance ?? 'VUS',
        tone: clinSigTone(sv.variant?.clinical_significance),
        score: sv.variant?.similarity_score,
      }))
    : recentVariants.map((v) => ({ ...v, score: undefined }))

  return (
    <div className="glass-panel recent-panel">
      <header>
        <h3>
          <MaterialIcon name={similarVariants?.length ? 'compare_arrows' : 'history'} />
          {similarVariants?.length ? 'Similar Known Variants' : 'Recent Variants'}
        </h3>
      </header>
      <div className="variant-list">
        {items.map((item, i) => (
          <Button className="variant-row" key={`${item.variant}-${i}`}>
            <span>
              <strong>{item.variant}</strong>
              <small>
                {item.detail}
                {item.score != null ? ` · ${Math.round(item.score * 100)}% similarity` : ''}
              </small>
            </span>
            <em className={item.tone}>{item.status}</em>
          </Button>
        ))}
      </div>
    </div>
  )
}