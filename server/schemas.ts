export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'

export type Mutation = {
  submitted?: string | null
  cdna_hgvs?: string | null
  protein_hgvs?: string | null
  reference_aa?: string | null
  alternate_aa?: string | null
  protein_position?: number | null
  submitted_reference_aa?: string | null
  observed_reference_aa?: string | null
  submitted_protein_hgvs?: string | null
  normalized_protein_hgvs?: string | null
  // free-form keys allowed (literature mentions, similar-variant fields)
  [key: string]: unknown
}

export type VariantRecord = {
  gene?: string | null
  mutation_text?: string | null
  input_text?: string | null
  display_name?: string | null
  query_terms?: string[] | null
  mutation?: Mutation | null
  source?: string | null
  wild_type_sequence?: string | null
  mutant_sequence?: string | null
  sequence?: string | null
  ensembl_transcript?: string | null
  [key: string]: unknown
}

export type SimilarVariant = {
  name?: string | null
  gene?: string | null
  source?: string | null
  clinical_significance?: string | null
  review_status?: string | null
  description?: string | null
  mutation?: Mutation | Record<string, unknown> | null
  protein_position?: number | null
  alternate_aa?: string | null
  mutant_sequence?: string | null
  evidence?: unknown
  similarity_score?: number | null
  similarity_reasons?: string[] | null
}

export type ProteinStructure = {
  label?: string | null
  source?: string | null
  sequence?: string | null
  sequence_length?: number | null
  full_sequence_length?: number | null
  modeled_region?: unknown
  mutation?: unknown
  pdb?: string | null
  viewer?: { format?: string; data?: string | null; recommended_viewer?: string; available?: boolean } | null
  warnings?: string[]
}

export type AnalysisResult = {
  variant?: VariantRecord | null
  annotations?: Record<string, unknown> | null
  similar_variants?: SimilarVariant[] | null
  structures?: Record<string, unknown> | null
  report?: { markdown?: string | null; patient_summary?: string | null; json?: Record<string, unknown> | null } | null
}

export type Job = {
  job_id: string
  status: JobStatus
  result?: AnalysisResult | null
  error?: string | null
  // pipeline scratch state — not part of the public response
  _input?: { gene: string; mutation: string }
  _annotations?: Record<string, unknown>
  _similar?: SimilarVariant[]
  _structures?: {
    wild_type?: ProteinStructure | null
    unknown_variant?: ProteinStructure | null
    similar_variants?: { variant: SimilarVariant; structure: ProteinStructure }[]
  }
}
