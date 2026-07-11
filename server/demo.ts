import type { Job, Mutation } from './schemas'

const AA_THREE_TO_ONE: Record<string, string> = {
  Ala: 'A',
  Arg: 'R',
  Asn: 'N',
  Asp: 'D',
  Cys: 'C',
  Gln: 'Q',
  Glu: 'E',
  Gly: 'G',
  His: 'H',
  Ile: 'I',
  Leu: 'L',
  Lys: 'K',
  Met: 'M',
  Phe: 'F',
  Pro: 'P',
  Ser: 'S',
  Thr: 'T',
  Trp: 'W',
  Tyr: 'Y',
  Val: 'V',
}

function mutationFromText(text: string): Mutation {
  const match = text.match(/(?:p\.)?([A-Z][a-z]{2}|[A-Z])(\d+)([A-Z][a-z]{2}|[A-Z])/)
  if (!match) return { submitted: text }
  const [, ref, pos, alt] = match
  const reference = AA_THREE_TO_ONE[ref] ?? ref
  const alternate = AA_THREE_TO_ONE[alt] ?? alt
  return {
    submitted: text,
    protein_hgvs: `p.${ref}${pos}${alt}`,
    reference_aa: reference,
    alternate_aa: alternate,
    protein_position: Number(pos),
  }
}

export function demoJob(jobId: string, gene: string, mutationText: string): Job {
  const mutation = mutationFromText(mutationText)
  const displayName = [gene, mutationText].filter(Boolean).join(' ')
  const variant = {
    gene,
    mutation_text: mutationText,
    input_text: displayName,
    display_name: displayName,
    query_terms: [gene, mutationText, mutation.protein_hgvs].filter(Boolean) as string[],
    mutation,
    source: 'demo_fixture',
  }
  const similar = [
    {
      name: `${gene} known missense analog`,
      gene,
      source: 'Demo ClinVar-style evidence',
      clinical_significance: 'Conflicting interpretations of pathogenicity',
      review_status: 'reviewed by expert panel',
      description:
        'A nearby missense variant is shown as an example of how FoldEx ranks known evidence against the submitted variant.',
      mutation,
      protein_position: mutation.protein_position ?? null,
      alternate_aa: mutation.alternate_aa ?? null,
      similarity_score: 0.82,
      similarity_reasons: ['same gene', 'nearby protein position', 'same amino-acid class change'],
    },
  ]
  const annotations = {
    variant,
    alpha_missense: {
      status: 'demo',
      predictions: [{ score: 0.64, prediction: 'ambiguous', transcript_id: 'demo-transcript' }],
    },
    clinvar: {
      status: 'demo',
      records: [
        {
          title: `${displayName} demo evidence record`,
          clinical_significance: 'Conflicting interpretations of pathogenicity',
          review_status: 'reviewed by expert panel',
        },
      ],
    },
    gnomad: {
      status: 'demo',
      population_frequency: 0.000003,
      population_frequency_source: 'demo gnomAD-like frequency',
    },
    uniprot: {
      status: 'demo',
      protein_name: `${gene} protein`,
      length: 720,
      domains: [{ description: 'Functional protein domain', start: 120, end: 420 }],
      function: [
        `${gene} is shown in demo mode to illustrate how FoldEx combines gene function, population frequency, structural features, and known variant evidence.`,
      ],
    },
    features: {
      sequence: {
        length: 720,
        molecular_weight_da: 82300,
        average_hydropathy: -0.21,
        class_composition: { nonpolar: 0.38, polar: 0.24, positive: 0.11, negative: 0.1, aromatic: 0.07, special: 0.1 },
      },
      mutation: {
        ...mutation,
        reference_properties: { name: mutation.reference_aa ?? 'reference', hydropathy: -0.4, mass: 75.1, class: 'polar' },
        alternate_properties: { name: mutation.alternate_aa ?? 'alternate', hydropathy: -3.5, mass: 133.1, class: 'charged' },
        class_change: true,
        hydropathy_delta: -3.1,
        mass_delta_da: 58,
      },
      structure: { model_available: false, atom_count: null, residue_count: null, chains: [], radius_of_gyration_angstrom: null },
      warnings: ['Demo mode uses fixture evidence so the deployed resume demo works without paid databases or live scientific APIs.'],
    },
    warnings: ['Demo mode: values are realistic examples, not live clinical evidence.'],
  }
  const structures = {
    unknown_variant: {
      label: displayName,
      source: 'demo_fixture',
      sequence_length: 720,
      mutation,
      pdb: null,
      viewer: { format: 'pdb', data: null, recommended_viewer: '3Dmol.js', available: false },
      warnings: ['Live ESMFold is disabled in demo mode.'],
    },
    wild_type: null,
    similar_variants: [{ variant: similar[0], structure: null }],
  }
  const markdown = `# Variant Research Report

## What FoldEx is showing
FoldEx turns a gene variant into a reviewer-friendly evidence packet: parsed mutation, population frequency, known clinical assertions, structural features, similar variants, and a plain-language summary.

## Demo evidence
- Variant: ${displayName}
- Clinical evidence: conflicting or uncertain in this fixture
- Population frequency: very rare demo frequency
- Structural note: live ESMFold is skipped for the public resume demo

Research support only. This is not medical advice, diagnosis, or treatment guidance.`

  return {
    job_id: jobId,
    status: 'completed',
    result: {
      variant,
      annotations,
      similar_variants: similar,
      structures,
      report: {
        markdown,
        patient_summary:
          '**What we found**\n\nThis demo identified a gene variant and organized the available-style evidence around it.\n\n**What this means**\n\nThe example evidence is intentionally uncertain, which shows how FoldEx separates known evidence from computational prediction instead of claiming a diagnosis.\n\n**What to do next**\n\nDiscuss real genetic results with a clinician or genetic counselor.\n\n*This summary is for research support only and is not medical advice. Please review it with a qualified clinician or genetic counselor.*',
        json: {
          status: 'complete',
          variant,
          classification_summary: {
            alpha_missense: annotations.alpha_missense,
            clinvar: annotations.clinvar.records,
            gnomad: annotations.gnomad,
            overall_interpretation: 'Demo evidence is intentionally uncertain and should not be used clinically.',
          },
          wild_type: {
            gene,
            protein: `${gene} protein`,
            uniprot: annotations.uniprot,
            sequence_length: 720,
            description: annotations.uniprot.function[0],
          },
          unknown_variant: {
            display_name: displayName,
            mutation,
            features: annotations.features,
            description:
              'The amino-acid substitution changes residue class in this demo, so FoldEx flags it for human review alongside population and clinical evidence.',
          },
          similar_variants: similar,
          structures,
          warnings: annotations.warnings,
          disclaimer: 'Research support only. This is not medical advice, diagnosis, or treatment guidance.',
        },
      },
    },
  }
}
