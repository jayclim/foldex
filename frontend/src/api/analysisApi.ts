const API_BASE = 'http://localhost:8000'

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'

export type MutationSchema = {
  submitted?: string | null
  cdna_hgvs?: string | null
  protein_hgvs?: string | null
  reference_aa?: string | null
  alternate_aa?: string | null
  protein_position?: number | null
}

export type VariantRecord = {
  gene?: string | null
  mutation_text?: string | null
  input_text?: string | null
  display_name?: string | null
  query_terms?: string[] | null
  mutation?: MutationSchema | null
  source?: string | null
  wild_type_sequence?: string | null
  mutant_sequence?: string | null
  sequence?: string | null
}

export type SimilarVariant = {
  name?: string | null
  gene?: string | null
  source?: string | null
  clinical_significance?: string | null
  review_status?: string | null
  description?: string | null
  mutation?: unknown
  protein_position?: number | null
  alternate_aa?: string | null
  mutant_sequence?: string | null
  evidence?: unknown
  similarity_score?: number | null
  similarity_reasons?: string[] | null
}

export type StructureViewer = {
  format?: string | null
  data?: string | null
  recommended_viewer?: string | null
  available?: boolean | null
}

export type ProteinStructure = {
  label?: string | null
  source?: string | null
  sequence?: string | null
  sequence_length?: number | null
  mutation?: unknown
  pdb?: string | null
  viewer?: StructureViewer | null
  warnings?: string[] | null
}

export type SimilarVariantStructure = {
  variant?: SimilarVariant | null
  structure?: ProteinStructure | null
}

export type StructuresPayload = {
  wild_type?: ProteinStructure | null
  unknown_variant?: ProteinStructure | null
  similar_variants?: SimilarVariantStructure[] | null
}

export type ReportJson = {
  status?: string | null
  variant?: VariantRecord | null
  classification_summary?: {
    alpha_missense?: unknown
    clinvar?: Array<{
      uid?: string
      title?: string
      clinical_significance?: string
      review_status?: string
      trait_set?: unknown
      genes?: unknown
    }> | null
    gnomad?: unknown
    overall_interpretation?: string | null
  } | null
  wild_type?: {
    gene?: string | null
    protein?: string | null
    uniprot?: unknown
    sequence_length?: number | null
    description?: string | null
  } | null
  unknown_variant?: {
    display_name?: string | null
    mutation?: unknown
    features?: unknown
    description?: string | null
  } | null
  similar_variants?: SimilarVariant[] | null
  structures?: StructuresPayload | null
  warnings?: string[] | null
  disclaimer?: string | null
}

export type ReportData = {
  markdown?: string | null
  json?: ReportJson | null
}

export type AnalysisResult = {
  variant?: VariantRecord | null
  annotations?: {
    variant?: VariantRecord | null
    vep?: { status: string; query?: string; records?: unknown[]; warnings?: string[] } | null
    alpha_missense?: {
      status: string
      predictions?: Array<{ score: number; prediction: string; transcript_id: string }> | null
    } | null
    clinvar?: {
      status: string
      records?: Array<{ uid?: string; clinical_significance?: string; review_status?: string; title?: string }> | null
    } | null
    gnomad?: {
      status: string
      population_frequency?: number | Record<string, unknown> | null
      population_frequency_source?: string | null
      population_frequencies?: Record<string, unknown> | null
    } | null
    uniprot?: {
      status: string
      accession?: string
      protein_name?: string
      sequence?: string
      length?: number
      domains?: Array<{ description: string; start: number; end: number }> | null
      function?: string[] | null
    } | null
    features?: {
      sequence?: {
        length?: number
        molecular_weight_da?: number
        average_hydropathy?: number
        composition?: Record<string, number>
        class_composition?: {
          nonpolar?: number
          positive?: number
          negative?: number
          polar?: number
          aromatic?: number
          special?: number
        }
        charge_balance?: {
          positive_fraction?: number
          negative_fraction?: number
          net_positive_minus_negative?: number
        }
      } | null
      mutation?: {
        reference_aa?: string | null
        alternate_aa?: string | null
        protein_position?: number | null
        position_fraction?: number | null
        reference_properties?: { name: string; hydropathy: number; mass: number; class: string } | null
        alternate_properties?: { name: string; hydropathy: number; mass: number; class: string } | null
        class_change?: boolean | null
        hydropathy_delta?: number | null
        mass_delta_da?: number | null
        local_window?: { start: number; end: number; sequence: string } | null
      } | null
      structure?: {
        model_available?: boolean
        atom_count?: number
        residue_count?: number
        chains?: string[]
        radius_of_gyration_angstrom?: number | null
      } | null
      warnings?: string[]
    } | null
    warnings?: string[]
  } | null
  similar_variants?: SimilarVariant[] | null
  structures?: StructuresPayload | null
  report?: ReportData | null
}

export type JobResponse = {
  job_id: string
  status: JobStatus
  result?: AnalysisResult | null
  error?: string | null
}

export async function submitAnalysis(
  gene: string,
  mutation: string,
): Promise<{ job_id: string; status: string }> {
  console.log('[API → submitAnalysis] request', { gene, mutation })
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gene, mutation }),
  })
  if (!res.ok) {
    console.error('[API ← submitAnalysis] failed', { status: res.status })
    throw new Error(`Analysis submit failed: ${res.status}`)
  }
  const data = await res.json()
  console.log('[API ← submitAnalysis] response', data)
  return data
}

export async function pollJob(jobId: string): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`)
  if (!res.ok) {
    console.error('[API ← pollJob] failed', { jobId, status: res.status })
    throw new Error(`Job poll failed: ${res.status}`)
  }
  const data: JobResponse = await res.json()
  console.group(
    `[API ← pollJob] ${jobId} status=${data.status}${data.error ? ' error' : ''}`,
  )
  console.log('full response (object)', data)
  console.log('full response (JSON):\n' + JSON.stringify(data, null, 2))
  if (data.result) {
    console.log(
      'result.variant:\n' + JSON.stringify(data.result.variant, null, 2),
    )
    console.log(
      'result.annotations:\n' +
        JSON.stringify(data.result.annotations, null, 2),
    )
    console.log(
      'result.similar_variants:\n' +
        JSON.stringify(data.result.similar_variants, null, 2),
    )
    console.log(
      'result.structures:\n' +
        JSON.stringify(data.result.structures, null, 2),
    )
    console.log(
      'result.report:\n' + JSON.stringify(data.result.report, null, 2),
    )
  }
  if (data.error) {
    console.warn('error', data.error)
  }
  console.groupEnd()
  return data
}
