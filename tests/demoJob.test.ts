import { describe, expect, it } from 'vitest'

import { demoJob } from '../server/demo'
import { AMINO_ACID_PROPERTIES } from '../server/features'

describe('demoJob', () => {
  it('computes amino-acid properties from the real table (not hardcoded)', () => {
    const job = demoJob('id', 'BRCA1', 'p.Arg1699Gln')
    const mut = job.result!.annotations.features.mutation as Record<string, unknown>

    // Regression guard: these were previously wrong fixed values (Gly's mass, etc.).
    expect(mut.reference_properties).toEqual(AMINO_ACID_PROPERTIES.R) // Arg: positive, 174.2
    expect(mut.alternate_properties).toEqual(AMINO_ACID_PROPERTIES.Q) // Gln: polar, 146.15
    expect(mut.class_change).toBe(true)
    expect(mut.hydropathy_delta).toBe(1) // -3.5 - (-4.5)
    expect(mut.mass_delta_da).toBe(-28.05) // 146.15 - 174.2
  })

  it('uses real curated protein-level values for demo genes', () => {
    const job = demoJob('id', 'BRCA1', 'p.Arg1699Gln')
    const json = job.result!.report.json!

    expect(json.wild_type!.sequence_length).toBe(1863) // real BRCA1, not the old 720
    expect(json.classification_summary!.clinvar![0].clinical_significance).toBe('Pathogenic')

    // Position must fall within the sequence (the old 720 gave a nonsensical 236%).
    const pos = job.result!.variant.mutation!.protein_position as number
    const len = (job.result!.annotations.features.sequence as Record<string, number>).length
    expect(pos).toBeLessThanOrEqual(len)
  })
})
