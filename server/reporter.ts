import { fetchWithTimeout } from './http'

type AnyDict = Record<string, unknown>

function asDict(v: unknown): AnyDict {
  return v && typeof v === 'object' ? (v as AnyDict) : {}
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

const PATIENT_SUMMARY_INSTRUCTIONS =
  'Rewrite the variant report below as a short plain-language explanation for the patient. ' +
  'Use only facts already present in the report — do not introduce new findings, statistics, ' +
  'citations, or recommendations. Audience is a non-scientist adult with no genetics background.\n\n' +
  'Requirements:\n' +
  '- 120-180 words, in markdown.\n' +
  '- Start with a one-sentence plain-language description of what the variant is.\n' +
  '- Use 3 short sections with these exact headings:\n' +
  '  **What we found**, **What this means**, **What to do next**.\n' +
  "- Translate jargon (e.g. 'missense', 'pathogenic', 'allele frequency'). No abbreviations " +
  'without an inline definition. No raw scores or p-values.\n' +
  '- Preserve uncertainty honestly: if the report says evidence is missing, conflicting, or ' +
  'uncertain, say so plainly. Do not reassure beyond the evidence.\n' +
  "- Under 'What to do next', the only recommendation is to discuss the report with their " +
  'clinician or genetic counselor. Do not suggest treatments, lifestyle changes, or tests.\n' +
  '- End with this exact line on its own:\n' +
  '  *This summary is for research support only and is not medical advice. Please review it ' +
  'with a qualified clinician or genetic counselor.*\n'

function patientSummaryPrompt(reportMarkdown: string, evidence: AnyDict): string {
  const variant = asDict(evidence.variant)
  const context = {
    display_name: variant.display_name ?? null,
    gene: variant.gene ?? null,
    overall_interpretation: asDict(evidence.classification_summary).overall_interpretation ?? null,
  }
  return (
    `${PATIENT_SUMMARY_INSTRUCTIONS}\n` +
    `Variant context (for grounding only, do not quote verbatim):\n` +
    `${JSON.stringify(context, null, 2)}\n\n` +
    `Full report markdown:\n---\n${reportMarkdown}\n---`
  )
}

function overallInterpretation(alpha: AnyDict, clinvarRecords: AnyDict[]): string {
  const labels = clinvarRecords
    .map((r) => ((r.clinical_significance as string) ?? '').toLowerCase())
    .join(' ')
  if (labels.includes('pathogenic') && !labels.includes('benign')) {
    return 'Known ClinVar evidence includes pathogenic assertions.'
  }
  if (labels.includes('benign') && !labels.includes('pathogenic')) {
    return 'Known ClinVar evidence includes benign assertions.'
  }
  const predictions = asArray(alpha.predictions)
  if (predictions.length) {
    return 'AlphaMissense predictions are available and should be reviewed with ClinVar and frequency evidence.'
  }
  return 'Insufficient evidence for benign/pathogenic classification.'
}

function wildTypeDescription(annotations: AnyDict): string {
  const uniprot = asDict(annotations.uniprot)
  const functions = asArray<string>(uniprot.function)
  if (functions.length) return functions[0]
  return 'Wild-type function was not available from the current evidence.'
}

function unknownVariantDescription(variant: AnyDict, features: AnyDict): string {
  const mutation = asDict(variant.mutation)
  const featureMutation = asDict(features.mutation)
  const pieces = [
    mutation.protein_hgvs ? `Substitution ${mutation.protein_hgvs}` : null,
    mutation.protein_position ? `at protein position ${mutation.protein_position}` : null,
    featureMutation.class_change !== undefined && featureMutation.class_change !== null
      ? `changes amino-acid class: ${featureMutation.class_change}`
      : null,
    featureMutation.hydropathy_delta !== undefined && featureMutation.hydropathy_delta !== null
      ? `hydropathy delta ${featureMutation.hydropathy_delta}`
      : null,
  ]
  return pieces.filter(Boolean).join('; ') || 'Variant features are incomplete.'
}

function structuredEvidence(
  variant: AnyDict,
  annotations: AnyDict,
  similarVariants: AnyDict[],
): AnyDict {
  const parsedVariant = asDict(annotations.variant) || variant
  const features = asDict(annotations.features)
  const alpha = asDict(annotations.alpha_missense)
  const clinvarRecords = asArray<AnyDict>(asDict(annotations.clinvar).records)
  const warnings: string[] = []
  warnings.push(...asArray<string>(annotations.warnings))
  warnings.push(...asArray<string>(features.warnings))

  return {
    variant: parsedVariant,
    classification_summary: {
      alpha_missense: alpha,
      clinvar: clinvarRecords.slice(0, 5),
      gnomad: annotations.gnomad ?? null,
      overall_interpretation: overallInterpretation(alpha, clinvarRecords),
    },
    wild_type: {
      gene: parsedVariant.gene ?? null,
      protein: asDict(annotations.uniprot).protein_name ?? null,
      uniprot: annotations.uniprot ?? null,
      sequence_length: asDict(annotations.uniprot).length ?? null,
      description: wildTypeDescription(annotations),
    },
    unknown_variant: {
      display_name: parsedVariant.display_name ?? null,
      mutation: parsedVariant.mutation ?? null,
      features,
      description: unknownVariantDescription(parsedVariant, features),
    },
    similar_variants: similarVariants.map((item) => ({
      name: item.name ?? null,
      source: item.source ?? null,
      similarity_score: item.similarity_score ?? null,
      similarity_reasons: item.similarity_reasons ?? null,
      clinical_significance: item.clinical_significance ?? null,
      description: item.description ?? null,
    })),
    warnings,
  }
}

async function claudeReport(evidence: AnyDict): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const evidenceForPrompt: AnyDict = {}
    for (const [k, v] of Object.entries(evidence)) {
      if (k !== 'structures') evidenceForPrompt[k] = v
    }
    const message = await client.messages.create({
      model: process.env.FOLDEX_CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 1800,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content:
            'Generate a concise variant research report in markdown using only the ' +
            'structured evidence below. Do not invent symptoms, diagnoses, population ' +
            'frequencies, pathogenicity, papers, or structures. If evidence is missing, ' +
            'say it is missing. Include sections for classification, wild type, unknown ' +
            'variant features, similar variants, likely behavior/expression based only on ' +
            'similar known variants, 3D structures, and research-only disclaimer.\n\n' +
            JSON.stringify(evidenceForPrompt, null, 2),
        },
      ],
    })
    return message.content
      .map((block: { type: string; text?: string }) => (block.type === 'text' ? block.text ?? '' : ''))
      .join('')
  } catch (e) {
    console.error('Claude report failed:', e)
    return null
  }
}

async function claudePatientSummary(reportMarkdown: string, evidence: AnyDict): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || !reportMarkdown) return null
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: process.env.FOLDEX_CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 600,
      temperature: 0,
      messages: [{ role: 'user', content: patientSummaryPrompt(reportMarkdown, evidence) }],
    })
    const text = message.content
      .map((block: { type: string; text?: string }) => (block.type === 'text' ? block.text ?? '' : ''))
      .join('')
      .trim()
    return text || null
  } catch (e) {
    console.error('Claude patient summary failed:', e)
    return null
  }
}

async function groqReport(evidence: AnyDict): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null
  const url = process.env.FOLDEX_GROQ_URL ?? 'https://api.groq.com/openai/v1/chat/completions'
  const model = process.env.FOLDEX_GROQ_MODEL ?? 'llama-3.3-70b-versatile'
  const evidenceForPrompt: AnyDict = {}
  for (const [k, v] of Object.entries(evidence)) {
    if (k !== 'structures') evidenceForPrompt[k] = v
  }
  const prompt =
    'Generate a concise variant research report in markdown using only the structured ' +
    'evidence below. Do not invent symptoms, diagnoses, population frequencies, ' +
    'pathogenicity, papers, or structures. If evidence is missing, say it is missing. ' +
    'Include sections for classification, wild type, unknown variant features, similar ' +
    'variants, likely behavior/expression based only on similar known variants, 3D ' +
    'structures, and research-only disclaimer.\n\n' +
    JSON.stringify(evidenceForPrompt, null, 2)
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
      timeoutMs: 50_000,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as AnyDict
    const choices = asArray<AnyDict>(data.choices)
    if (!choices.length) return null
    return (asDict(choices[0].message).content as string) ?? null
  } catch (e) {
    console.error('Groq report failed:', e)
    return null
  }
}

async function groqPatientSummary(reportMarkdown: string, evidence: AnyDict): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey || !reportMarkdown) return null
  const url = process.env.FOLDEX_GROQ_URL ?? 'https://api.groq.com/openai/v1/chat/completions'
  const model = process.env.FOLDEX_GROQ_MODEL ?? 'llama-3.3-70b-versatile'
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: patientSummaryPrompt(reportMarkdown, evidence) }],
        temperature: 0,
      }),
      timeoutMs: 50_000,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as AnyDict
    const choices = asArray<AnyDict>(data.choices)
    if (!choices.length) return null
    return ((asDict(choices[0].message).content as string) ?? '').trim() || null
  } catch (e) {
    console.error('Groq patient summary failed:', e)
    return null
  }
}

function fallbackPatientSummary(evidence: AnyDict): string {
  const variant = asDict(evidence.variant)
  const summary = asDict(evidence.classification_summary)
  const name = (variant.display_name as string) || (variant.gene as string) || 'this variant'
  const interpretation =
    (summary.overall_interpretation as string) ||
    'The available evidence is limited, so the effect of this change is uncertain.'
  return [
    '**What we found**\n',
    `Your test identified a change in your DNA called ${name}. A 'variant' simply means a spelling difference in a gene compared with the typical reference.\n`,
    '**What this means**\n',
    `${interpretation} In plain terms, scientists do not yet have enough information to say with confidence whether this change affects your health.\n`,
    '**What to do next**\n',
    'Please share this report with your clinician or a genetic counselor. They can put it in the context of your personal and family history and help you decide on next steps.\n',
    '*This summary is for research support only and is not medical advice. Please review it with a qualified clinician or genetic counselor.*',
  ].join('\n')
}

function behaviorSummary(similarVariants: AnyDict[]): string {
  const known = similarVariants.filter((item) => item.source === 'ClinVar')
  if (!known.length) {
    return 'No known similar variants with clinical assertions were available, so behavior or expression should not be inferred beyond the measured features.'
  }
  const labels = known
    .slice(0, 5)
    .map((item) => (item.clinical_significance as string) || 'unknown')
    .join(', ')
  return `Closest known variant assertions include: ${labels}. Interpret cautiously with the ranked evidence.`
}

function fallbackMarkdown(evidence: AnyDict, structures: AnyDict): string {
  const variant = asDict(evidence.variant)
  const summary = asDict(evidence.classification_summary)
  const unknown = asDict(evidence.unknown_variant)
  const wildType = asDict(evidence.wild_type)
  const similar = asArray<AnyDict>(evidence.similar_variants)
  const warnings = asArray<string>(evidence.warnings)

  const lines: string[] = [
    '# Variant Research Report',
    '',
    '## Variant',
    `- Input: ${variant.input_text}`,
    `- Parsed variant: ${variant.display_name}`,
    `- Gene: ${variant.gene || 'unknown'}`,
    '',
    '## Benign / Pathogenic Evidence',
    `- Overall interpretation: ${summary.overall_interpretation}`,
    `- AlphaMissense status: ${asDict(summary.alpha_missense).status ?? ''}`,
    `- ClinVar records found: ${asArray(summary.clinvar).length}`,
    `- Population frequency: ${asDict(summary.gnomad).population_frequency ?? ''}`,
    '',
    '## Wild Type',
    `- Protein: ${wildType.protein || 'unknown'}`,
    `- Sequence length: ${wildType.sequence_length || 'unknown'}`,
    `- Description: ${wildType.description}`,
    '',
    '## Unknown Variant Features',
    `- Description: ${unknown.description}`,
    `- Mutation features: ${JSON.stringify(asDict(unknown.features).mutation ?? {})}`,
    '',
    '## Similar Known Variants',
  ]

  if (similar.length) {
    for (const item of similar) {
      const reasons = asArray<string>(item.similarity_reasons).join('; ')
      lines.push(
        `- ${item.name}: score ${item.similarity_score} (${reasons}). ${item.description ?? ''}`,
      )
    }
  } else {
    lines.push('- No similar variants were found from the available evidence.')
  }

  lines.push(
    '',
    '## Likely Behavior / Expression',
    behaviorSummary(similar),
    '',
    '## 3D Structures',
    `- Wild type model available: ${asDict(asDict(structures.wild_type).viewer).available}`,
    `- Unknown variant model available: ${asDict(asDict(structures.unknown_variant).viewer).available}`,
    `- Similar variant models: ${asArray(structures.similar_variants).length}`,
    '',
    '## Warnings',
  )

  if (warnings.length) {
    for (const w of warnings) lines.push(`- ${w}`)
  } else {
    lines.push('- None')
  }

  lines.push('', 'Research support only. This is not medical advice, diagnosis, or treatment guidance.')
  return lines.join('\n')
}

export async function generateReport(
  variant: AnyDict,
  annotations: AnyDict,
  similarVariants: AnyDict[],
  structures: AnyDict,
): Promise<AnyDict> {
  const evidence = structuredEvidence(variant, annotations, similarVariants)
  const aiMarkdown = (await claudeReport(evidence)) ?? (await groqReport(evidence))
  const markdown = aiMarkdown ?? fallbackMarkdown(evidence, structures)

  const patientSummary =
    (await claudePatientSummary(markdown, evidence)) ??
    (await groqPatientSummary(markdown, evidence)) ??
    fallbackPatientSummary(evidence)

  return {
    markdown,
    patient_summary: patientSummary,
    json: {
      status: 'complete',
      variant: evidence.variant,
      classification_summary: evidence.classification_summary,
      wild_type: evidence.wild_type,
      unknown_variant: evidence.unknown_variant,
      similar_variants: evidence.similar_variants,
      structures,
      warnings: evidence.warnings,
      disclaimer: 'Research support only. This is not medical advice, diagnosis, or treatment guidance.',
    },
  }
}
