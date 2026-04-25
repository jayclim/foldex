export const structureModes = [
  { icon: 'view_in_ar', label: 'Surface' },
  { icon: 'hub', label: 'Ribbon', active: true },
  { icon: 'grain', label: 'Atoms' },
]

export const structureControls = ['zoom_in', 'zoom_out', 'rotate_right']

export const reportStats = [
  {
    title: 'Binding Affinity (Delta G)',
    icon: 'link',
    value: '-4.2',
    unit: 'kcal/mol',
    trendIcon: 'trending_down',
    trend: '-1.8 vs Wild Type',
    tone: 'error',
    detailLabel: 'Wild Type',
    detailValue: '-6.0 kcal/mol',
    progress: 70,
  },
  {
    title: 'Thermal Stability (Tm)',
    value: '48.5',
    unit: 'C',
    trendIcon: 'arrow_downward',
    trend: '-12.0C Destabilization',
    tone: 'error',
    bars: [80, 90, 40, 85, 70],
  },
]

export const clinicalSnippets = [
  {
    title: 'Phenotypic Association',
    body: 'Associated with hereditary breast and ovarian cancer syndrome (HBOC).',
  },
  {
    title: 'Functional Domain',
    body: 'Located in BRCT domain; critical for DNA repair phosphoprotein binding.',
  },
  {
    title: 'Population Freq.',
    body: 'Rare (< 0.001%). Not identified in gnomAD non-cancer cohorts.',
  },
]

export const similarVariants = [
  {
    id: '#FLX-882',
    classification: 'PATHOGENIC',
    tone: 'error',
    similarity: '88%',
    description: 'Exhibits similar BRCT domain destabilization and loss of BACH1 interaction.',
  },
  {
    id: '#FLX-129',
    classification: 'BENIGN',
    tone: 'success',
    similarity: '74%',
    description: 'Conservative substitution at adjacent residue with minimal structural impact.',
  },
  {
    id: '#FLX-044',
    classification: 'PATHOGENIC',
    tone: 'error',
    similarity: '65%',
    description: 'Known to cause complete disruption of the protein core folding mechanism.',
  },
  {
    id: '#FLX-912',
    classification: 'VUS',
    tone: 'neutral',
    similarity: '52%',
    description: 'Variant of uncertain significance with partial hydrophobic pocket exposure.',
  },
]

export const comparisonRows = [
  {
    parameter: 'H-Bond Density',
    wildType: '12 bonds / core',
    variant: '8 bonds / core',
    delta: '-4.0',
    deltaTone: 'error',
    impact: 'SEVERE',
    impactTone: 'error',
  },
  {
    parameter: 'Surface Exposure',
    wildType: '12.4 A2',
    variant: '45.8 A2',
    delta: '+33.4',
    deltaTone: 'success',
    impact: 'HYDROPHOBIC SHIFT',
    impactTone: 'success',
  },
  {
    parameter: 'Coulombic Energy',
    wildType: '-142.1 kJ/mol',
    variant: '-98.4 kJ/mol',
    delta: '+43.7',
    deltaTone: 'error',
    impact: 'ELECTROSTATIC REPULSION',
    impactTone: 'error',
  },
  {
    parameter: 'Backbone Strain',
    wildType: '0.24 kcal/mol',
    variant: '2.88 kcal/mol',
    delta: '+2.64',
    deltaTone: 'error',
    impact: 'STERIC HINDRANCE',
    impactTone: 'error',
  },
  {
    parameter: 'Solvation Energy',
    wildType: '-45.2 kJ/mol',
    variant: '-48.1 kJ/mol',
    delta: '-2.9',
    deltaTone: 'success',
    impact: 'NEGLIGIBLE',
    impactTone: 'neutral',
  },
]
