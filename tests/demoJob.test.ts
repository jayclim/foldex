import { describe, expect, it } from 'vitest'

import { demoJob } from '../server/demo'
import { AMINO_ACID_PROPERTIES } from '../server/features'

describe('demoJob', () => {
  it('computes amino-acid properties from the real table (not hardcoded)', () => {
    const result = demoJob('id', 'BRCA1', 'p.Arg1699Gln').result as any
    const mut = result.annotations.features.mutation

    // Regression guard: these were previously wrong fixed values (Gly's mass, etc.).
    expect(mut.reference_properties).toEqual(AMINO_ACID_PROPERTIES.R) // Arg: positive, 174.2
    expect(mut.alternate_properties).toEqual(AMINO_ACID_PROPERTIES.Q) // Gln: polar, 146.15
    expect(mut.class_change).toBe(true)
    expect(mut.hydropathy_delta).toBe(1) // -3.5 - (-4.5)
    expect(mut.mass_delta_da).toBe(-28.05) // 146.15 - 174.2
  })

  it('uses real curated protein-level values for demo genes', () => {
    const result = demoJob('id', 'BRCA1', 'p.Arg1699Gln').result as any
    const json = result.report.json

    expect(json.wild_type.sequence_length).toBe(1863) // real BRCA1, not the old 720
    expect(json.classification_summary.clinvar[0].clinical_significance).toBe('Pathogenic')

    // Position must fall within the sequence (the old 720 gave a nonsensical 236%).
    const pos = result.variant.mutation.protein_position
    const len = result.annotations.features.sequence.length
    expect(pos).toBeLessThanOrEqual(len)
  })

  it('produces a full multi-section research report', () => {
    const md = (demoJob('id', 'TP53', 'p.Arg175His').result as any).report.markdown as string
    for (const heading of ['## Classification & Evidence', '## Wild-Type Protein', '## Variant Features', '## Similar Known Variants']) {
      expect(md).toContain(heading)
    }
  })
})
