import type { Job, Mutation } from './schemas'
import { AMINO_ACID_PROPERTIES } from './features'

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

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
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

type GeneProfile = {
  known: boolean
  accession: string | null
  protein_name: string
  length: number
  molecular_weight_da: number
  average_hydropathy: number
  class_composition: Record<string, number>
  functionText: string
  domains: { description: string; start: number; end: number }[]
  alpha_missense: { score: number; prediction: string; transcript_id: string }
  clinvar: { title: string; clinical_significance: string; review_status: string }
  gnomad: { population_frequency: number; source: string }
}

// Real values captured by running the live annotation pipeline (UniProt, Ensembl
// VEP + AlphaMissense, NCBI ClinVar, gnomAD) against each demo input. Baked in so
// the public demo shows accurate numbers without live API calls at request time.
// ponytail: only the three demo inputs are curated; other genes get a clearly
// illustrative fallback below. Add a gene here when it becomes a demo input.
const DEMO_GENES: Record<string, GeneProfile> = {
  BRCA1: {
    known: true,
    accession: 'P38398',
    protein_name: 'Breast cancer type 1 susceptibility protein',
    length: 1863,
    molecular_weight_da: 241237.87,
    average_hydropathy: -0.784,
    class_composition: { nonpolar: 0.2405, polar: 0.321, positive: 0.1401, negative: 0.1519, aromatic: 0.0483, special: 0.0982 },
    functionText:
      'E3 ubiquitin-protein ligase that plays a central role in DNA repair by facilitating cellular responses to DNA damage, including double-strand break repair and homologous recombination.',
    domains: [
      { description: 'BRCT 1', start: 1642, end: 1736 },
      { description: 'BRCT 2', start: 1756, end: 1855 },
    ],
    alpha_missense: { score: 0.7345, prediction: 'likely_pathogenic', transcript_id: 'ENST00000352993' },
    clinvar: {
      title: 'NM_007294.4(BRCA1):c.5096G>A (p.Arg1699Gln)',
      clinical_significance: 'Pathogenic',
      review_status: 'reviewed by expert panel',
    },
    gnomad: { population_frequency: 0.0000192, source: 'gnomAD exome (v4)' },
  },
  TP53: {
    known: true,
    accession: 'P04637',
    protein_name: 'Cellular tumor antigen p53',
    length: 393,
    molecular_weight_da: 50696.13,
    average_hydropathy: -0.753,
    class_composition: { nonpolar: 0.2392, polar: 0.2519, positive: 0.1476, negative: 0.1272, aromatic: 0.0611, special: 0.173 },
    functionText:
      'Multifunctional transcription factor that induces cell cycle arrest, DNA repair, or apoptosis on binding its target DNA sequence; acts as a tumor suppressor and guardian of the genome.',
    domains: [],
    alpha_missense: { score: 0.9857, prediction: 'likely_pathogenic', transcript_id: 'ENST00000269305' },
    clinvar: {
      title: 'NM_000546.6(TP53):c.524G>A (p.Arg175His)',
      clinical_significance: 'Pathogenic',
      review_status: 'reviewed by expert panel',
    },
    gnomad: { population_frequency: 0.0000066, source: 'gnomAD genome (v4)' },
  },
  KRAS: {
    known: true,
    accession: 'P01116',
    protein_name: 'GTPase KRas',
    length: 189,
    molecular_weight_da: 25100.84,
    average_hydropathy: -0.448,
    class_composition: { nonpolar: 0.3016, polar: 0.2169, positive: 0.164, negative: 0.1587, aromatic: 0.0794, special: 0.0794 },
    functionText:
      'Signal transducer in the Ras-MAPK pathway that regulates cell proliferation and survival; cycles between an active GTP-bound and inactive GDP-bound state via intrinsic GTPase activity.',
    domains: [],
    alpha_missense: { score: 0.9984, prediction: 'likely_pathogenic', transcript_id: 'ENST00000256078' },
    clinvar: {
      title: 'NM_004985.5(KRAS):c.35G>A (p.Gly12Asp)',
      clinical_significance: 'Pathogenic/Likely pathogenic',
      review_status: 'criteria provided, multiple submitters, no conflicts',
    },
    gnomad: { population_frequency: 0.0000131, source: 'gnomAD genome (v4)' },
  },
}

function geneProfile(gene: string, mutation: Mutation): GeneProfile {
  const known = DEMO_GENES[gene.toUpperCase()]
  if (known) return known

  // Illustrative fallback for genes not curated above. Length is derived from the
  // mutation position so sequence-relative stats stay sane (no >100% positions).
  const position = mutation.protein_position ?? null
  const length = position ? Math.max(position + 60, 350) : 360
  return {
    known: false,
    accession: null,
    protein_name: `${gene} protein`,
    length,
    molecular_weight_da: round(length * 129, 2),
    average_hydropathy: -0.4,
    class_composition: { nonpolar: 0.28, polar: 0.28, positive: 0.13, negative: 0.13, aromatic: 0.07, special: 0.11 },
    functionText: `${gene} is shown in demo mode to illustrate how FoldEx combines gene function, population frequency, structural features, and known variant evidence.`,
    domains: [{ description: 'Illustrative functional domain', start: Math.max((position ?? 100) - 40, 1), end: (position ?? 100) + 40 }],
    alpha_missense: { score: 0.5, prediction: 'ambiguous', transcript_id: 'demo-transcript' },
    clinvar: {
      title: `${gene} ${mutation.submitted ?? ''} (illustrative demo record)`,
      clinical_significance: 'Uncertain significance',
      review_status: 'demo illustrative record',
    },
    gnomad: { population_frequency: 0.000003, source: 'demo gnomAD-like frequency' },
  }
}

function mutationFeatures(mutation: Mutation, length: number): Record<string, unknown> {
  const ref = mutation.reference_aa ?? null
  const alt = mutation.alternate_aa ?? null
  const position = mutation.protein_position ?? null
  const refProps = ref ? AMINO_ACID_PROPERTIES[ref] : undefined
  const altProps = alt ? AMINO_ACID_PROPERTIES[alt] : undefined
  return {
    ...mutation,
    reference_aa: ref,
    alternate_aa: alt,
    protein_position: position,
    reference_properties: refProps ?? null,
    alternate_properties: altProps ?? null,
    class_change: refProps && altProps ? refProps.class !== altProps.class : null,
    hydropathy_delta: refProps && altProps ? round(altProps.hydropathy - refProps.hydropathy, 3) : null,
    mass_delta_da: refProps && altProps ? round(altProps.mass - refProps.mass, 2) : null,
    position_fraction: position && length ? round(position / length, 4) : null,
  }
}

export function demoJob(jobId: string, gene: string, mutationText: string): Job {
  const mutation = mutationFromText(mutationText)
  const displayName = [gene, mutationText].filter(Boolean).join(' ')
  const profile = geneProfile(gene, mutation)
  const evidenceNote = profile.known
    ? 'Values below were captured from the live pipeline (UniProt, AlphaMissense, ClinVar, gnomAD) and are shown without live API calls.'
    : 'This gene is not in the curated demo set, so protein-level values are illustrative examples rather than live evidence.'

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
      name: `${gene} ${profile.clinvar.clinical_significance} analog`,
      gene,
      source: 'Demo ClinVar-style evidence',
      clinical_significance: profile.clinvar.clinical_significance,
      review_status: profile.clinvar.review_status,
      description:
        'A nearby known variant is shown as an example of how FoldEx ranks known evidence against the submitted variant.',
      mutation,
      protein_position: mutation.protein_position ?? null,
      alternate_aa: mutation.alternate_aa ?? null,
      similarity_score: 0.82,
      similarity_reasons: ['same gene', 'nearby protein position', 'same amino-acid class change'],
    },
  ]
  const clinvarRecords = [
    {
      title: profile.clinvar.title,
      clinical_significance: profile.clinvar.clinical_significance,
      review_status: profile.clinvar.review_status,
    },
  ]
  const annotations = {
    variant,
    alpha_missense: {
      status: 'demo',
      predictions: [profile.alpha_missense],
    },
    clinvar: {
      status: 'demo',
      records: clinvarRecords,
    },
    gnomad: {
      status: 'demo',
      population_frequency: profile.gnomad.population_frequency,
      population_frequency_source: profile.gnomad.source,
    },
    uniprot: {
      status: 'demo',
      accession: profile.accession,
      protein_name: profile.protein_name,
      length: profile.length,
      domains: profile.domains,
      function: [profile.functionText],
    },
    features: {
      sequence: {
        length: profile.length,
        molecular_weight_da: profile.molecular_weight_da,
        average_hydropathy: profile.average_hydropathy,
        class_composition: profile.class_composition,
      },
      mutation: mutationFeatures(mutation, profile.length),
      structure: { model_available: false, atom_count: null, residue_count: null, chains: [], radius_of_gyration_angstrom: null },
      warnings: ['Demo mode uses baked-in evidence so the deployed resume demo works without paid databases or live scientific APIs.'],
    },
    warnings: [`Demo mode: ${evidenceNote}`],
  }
  const structures = {
    unknown_variant: {
      label: displayName,
      source: 'demo_fixture',
      sequence_length: profile.length,
      mutation,
      pdb: null,
      viewer: { format: 'pdb', data: null, recommended_viewer: '3Dmol.js', available: false },
      warnings: ['Live ESMFold is disabled in demo mode.'],
    },
    wild_type: null,
    similar_variants: [{ variant: similar[0], structure: null }],
  }
  const freqText = profile.gnomad.population_frequency.toExponential(2)
  const markdown = `# Variant Research Report

## What FoldEx is showing
FoldEx turns a gene variant into a reviewer-friendly evidence packet: parsed mutation, population frequency, known clinical assertions, structural features, similar variants, and a plain-language summary.

## Evidence for ${displayName}
- Clinical classification: ${profile.clinvar.clinical_significance} (${profile.clinvar.review_status})
- AlphaMissense: ${profile.alpha_missense.score} (${profile.alpha_missense.prediction.replace('_', ' ')})
- Population frequency: ${freqText} — ${profile.gnomad.source}
- Structural note: live ESMFold is skipped for the public resume demo

${evidenceNote}

Research support only. This is not medical advice, diagnosis, or treatment guidance.`

  const wildDescription = `${profile.protein_name}. ${profile.functionText}`
  const overallInterpretation = profile.known
    ? `${profile.clinvar.clinical_significance} per ClinVar (${profile.clinvar.review_status}); AlphaMissense ${profile.alpha_missense.score}. Shown for demonstration — confirm any real result with a qualified reviewer.`
    : 'Illustrative demo evidence for a non-curated gene; not for clinical use.'

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
          '**What we found**\n\nThis demo identified a gene variant and organized the available evidence around it.\n\n**What this means**\n\nThe evidence is drawn from public databases to show how FoldEx separates known clinical evidence from computational prediction instead of claiming a diagnosis.\n\n**What to do next**\n\nDiscuss real genetic results with a clinician or genetic counselor.\n\n*This summary is for research support only and is not medical advice. Please review it with a qualified clinician or genetic counselor.*',
        json: {
          status: 'complete',
          variant,
          classification_summary: {
            alpha_missense: annotations.alpha_missense,
            clinvar: clinvarRecords,
            gnomad: annotations.gnomad,
            overall_interpretation: overallInterpretation,
          },
          wild_type: {
            gene,
            protein: profile.protein_name,
            uniprot: annotations.uniprot,
            sequence_length: profile.length,
            description: wildDescription,
          },
          unknown_variant: {
            display_name: displayName,
            mutation,
            features: annotations.features,
            description:
              'The amino-acid substitution is compared against the wild-type residue, and FoldEx flags it for human review alongside population and clinical evidence.',
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
