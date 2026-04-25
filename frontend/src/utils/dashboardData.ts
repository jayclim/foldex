export const navItems = [
  { icon: 'biotech', label: 'Analysis', href: '/' },
  { icon: 'analytics', label: 'Reports', href: '/reports' },
]

export const analysisSteps = [
  { label: 'ALIGNMENT_BWA_MEM', value: '100%', progress: 100, tone: 'green' },
  { label: 'VARIANT_CALLING_GATK', value: '72%', progress: 72, tone: 'cyan' },
  { label: 'STRUCTURAL_ANNOTATION', value: 'Pending', progress: 5, tone: 'slate' },
]

export const recentVariants = [
  {
    variant: 'chr17:g.41243532C>T',
    detail: 'BRCA1 | Exon 11',
    status: 'Pathogenic',
    tone: 'danger',
  },
  {
    variant: 'chr7:g.140453136A>T',
    detail: 'BRAF | V600E',
    status: 'Pathogenic',
    tone: 'danger',
  },
  {
    variant: 'chr13:g.32914438del',
    detail: 'BRCA2 | Frame Shift',
    status: 'Benign',
    tone: 'success',
  },
]

export const variantMetrics = [
  {
    label: 'ALLELE FREQUENCY',
    value: '0.0004%',
    note: 'Rare Clinical Marker',
    tone: 'cyan',
  },
  {
    label: 'CONSERVATION (PHASTCONS)',
    value: '0.998',
    note: 'Highly Conserved',
    tone: 'green',
  },
  {
    label: 'CLINVAR RATING',
    value: 'PATHOGENIC',
    note: 'Reviewed assertion',
    tone: 'danger',
  },
  {
    label: 'REVEL SCORE',
    value: '0.862',
    note: 'Above Threshold (>0.75)',
    tone: 'cyan',
  },
]

export const dataStream = [
  ['SIFT_SCORE', '0.01 (Deleterious)'],
  ['POLYPHEN_2', '0.98 (Prob_Damaging)'],
  ['GNOMAD_EXOMES', 'f=0.0000034'],
  ['TRANSCRIPT', 'NM_000546.6'],
]
