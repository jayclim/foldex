import { getJson, liveApisEnabled } from './http'

type AnyDict = Record<string, unknown>

const SIMILAR_AA: Record<string, string[]> = {
  A: ['V', 'G', 'S'], R: ['K', 'H', 'Q'], N: ['D', 'Q', 'S'], D: ['E', 'N', 'G'],
  C: ['S', 'A', 'G'], Q: ['N', 'E', 'R'], E: ['D', 'Q', 'K'], G: ['A', 'S', 'D'],
  H: ['R', 'K', 'Q'], I: ['L', 'V', 'M'], L: ['I', 'V', 'M'], K: ['R', 'H', 'E'],
  M: ['L', 'I', 'V'], F: ['Y', 'W', 'L'], P: ['A', 'S', 'T'], S: ['T', 'A', 'N'],
  T: ['S', 'A', 'V'], W: ['F', 'Y', 'L'], Y: ['F', 'W', 'H'], V: ['I', 'L', 'A'],
}

const AA_THREE_TO_ONE: Record<string, string> = {
  Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C', Gln: 'Q', Glu: 'E', Gly: 'G',
  His: 'H', Ile: 'I', Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P', Ser: 'S',
  Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V', Ter: '*',
}

const VARIANT_PATTERN = /\bp\.([A-Z][a-z]{2}|[A-Z])(\d{1,5})([A-Z][a-z]{2}|Ter|\*|[A-Z])\b/g

function asDict(v: unknown): AnyDict {
  return v && typeof v === 'object' ? (v as AnyDict) : {}
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function clinvarDescription(record: AnyDict): string {
  const pieces = [
    record.title as string | undefined,
    record.clinical_significance ? `Clinical significance: ${record.clinical_significance}` : null,
    record.review_status ? `Review status: ${record.review_status}` : null,
  ]
  return pieces.filter(Boolean).join('. ')
}

function clinvarClassification(record: AnyDict): AnyDict {
  for (const key of [
    'germline_classification',
    'clinical_significance',
    'somatic_clinical_impact',
    'oncogenicity_classification',
  ]) {
    const block = record[key]
    if (block && typeof block === 'object') {
      const b = block as AnyDict
      if (b.description || b.review_status) return b
    }
  }
  return {}
}

function literatureDescription(record: AnyDict): string {
  const pieces = [
    record.title as string | undefined,
    `Source: ${record.source}`,
    record.date ? `Date: ${record.date}` : null,
    record.url ? `URL: ${record.url}` : null,
  ]
  return pieces.filter(Boolean).join('. ')
}

function extractVariantMentions(text: string): AnyDict[] {
  const mentions: AnyDict[] = []
  for (const match of (text || '').matchAll(VARIANT_PATTERN)) {
    const [, ref, position, alt] = match
    const refAa = AA_THREE_TO_ONE[ref] ?? (ref.length === 1 ? ref : null)
    const altAa = AA_THREE_TO_ONE[alt] ?? (alt.length === 1 ? alt : null)
    mentions.push({
      protein_hgvs: `p.${ref}${position}${alt}`,
      reference_aa: refAa,
      alternate_aa: altAa,
      protein_position: parseInt(position, 10),
    })
  }
  return mentions
}

function exactClinvarCandidates(parsedVariant: AnyDict, annotations: AnyDict): AnyDict[] {
  const candidates: AnyDict[] = []
  const records = asArray<AnyDict>(asDict(annotations.clinvar).records)
  const mutation = asDict(parsedVariant.mutation)
  for (const record of records) {
    candidates.push({
      name: record.title || `${parsedVariant.gene} known ClinVar variant`,
      gene: parsedVariant.gene ?? null,
      source: 'ClinVar exact/near query',
      clinical_significance: record.clinical_significance ?? null,
      review_status: record.review_status ?? null,
      description: clinvarDescription(record),
      mutation,
      protein_position: mutation.protein_position ?? null,
      alternate_aa: mutation.alternate_aa ?? null,
      mutant_sequence: parsedVariant.mutant_sequence ?? null,
      evidence: record,
    })
  }
  return candidates
}

async function geneClinvarCandidates(parsedVariant: AnyDict): Promise<AnyDict[]> {
  const gene = parsedVariant.gene as string | undefined
  if (!gene) return []
  const query = `${gene}[Gene Name] AND missense`
  let summary: AnyDict
  let ids: string[]
  try {
    const search = (await getJson(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
      { params: { db: 'clinvar', term: query, retmode: 'json', retmax: 25 } },
    )) as AnyDict
    ids = asArray<string>(asDict(search.esearchresult).idlist)
    if (!ids.length) return []
    summary = (await getJson(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
      { params: { db: 'clinvar', id: ids.join(','), retmode: 'json' } },
    )) as AnyDict
  } catch {
    return []
  }

  const candidates: AnyDict[] = []
  const result = asDict(summary.result)
  for (const id of ids) {
    const record = result[id]
    if (!record || typeof record !== 'object') continue
    const r = record as AnyDict
    const title = (r.title as string) ?? ''
    const variantMentions = extractVariantMentions(title)
    const mutation = variantMentions[0] ?? {}
    const classification = clinvarClassification(r)
    candidates.push({
      name: title || `${gene} ClinVar variant`,
      gene,
      source: 'ClinVar gene search',
      clinical_significance: classification.description ?? null,
      review_status: classification.review_status ?? null,
      description: clinvarDescription({
        title,
        clinical_significance: classification.description,
        review_status: classification.review_status,
      }),
      mutation,
      protein_position: mutation.protein_position ?? null,
      alternate_aa: mutation.alternate_aa ?? null,
      evidence: {
        uid: r.uid ?? null,
        variation_id: r.variation_id ?? null,
        title,
        source_url: r.variation_id
          ? `https://www.ncbi.nlm.nih.gov/clinvar/variation/${r.variation_id}/`
          : null,
      },
    })
  }
  return candidates
}

async function searchPubmed(parsedVariant: AnyDict): Promise<AnyDict[]> {
  const gene = parsedVariant.gene as string | undefined
  if (!gene) return []
  const query = `(${gene}[Title/Abstract]) AND (variant OR mutation OR missense OR pathogenic)`
  let summary: AnyDict
  let ids: string[]
  try {
    const search = (await getJson(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
      { params: { db: 'pubmed', term: query, retmode: 'json', retmax: 25, sort: 'pub date' } },
    )) as AnyDict
    ids = asArray<string>(asDict(search.esearchresult).idlist)
    if (!ids.length) return []
    summary = (await getJson(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
      { params: { db: 'pubmed', id: ids.join(','), retmode: 'json' } },
    )) as AnyDict
  } catch {
    return []
  }
  const result = asDict(summary.result)
  const records: AnyDict[] = []
  for (const id of ids) {
    const r = result[id]
    if (!r || typeof r !== 'object') continue
    const rec = r as AnyDict
    const title = (rec.title as string) ?? ''
    records.push({
      source: 'PubMed',
      title,
      abstract: '',
      date: rec.pubdate ?? null,
      journal: rec.fulljournalname ?? null,
      authors: asArray<AnyDict>(rec.authors).slice(0, 6).map((a) => a.name).filter(Boolean),
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      id,
    })
  }
  return records
}

async function searchPreprints(parsedVariant: AnyDict, server: string): Promise<AnyDict[]> {
  const gene = parsedVariant.gene as string | undefined
  if (!gene) return []
  const lookbackDays = parseInt(process.env.FOLDEX_PREPRINT_LOOKBACK_DAYS ?? '730', 10)
  const end = new Date()
  const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const url = `https://api.biorxiv.org/details/${server}/${fmt(start)}/${fmt(end)}/0/json`

  let data: AnyDict
  try {
    data = (await getJson(url)) as AnyDict
  } catch {
    return []
  }

  const records: AnyDict[] = []
  const lowerGene = gene.toLowerCase()
  for (const item of asArray<AnyDict>(data.collection)) {
    const text = `${item.title ?? ''} ${item.abstract ?? ''}`.toLowerCase()
    if (!text.includes(lowerGene)) continue
    records.push({
      source: server,
      title: item.title ?? null,
      abstract: item.abstract ?? '',
      date: item.date ?? null,
      journal: server,
      authors: item.authors ?? null,
      url: item.doi ? `https://doi.org/${item.doi}` : null,
      id: item.doi ?? null,
    })
    if (records.length >= 15) break
  }
  return records
}

async function searchLiterature(parsedVariant: AnyDict): Promise<AnyDict[]> {
  const records: AnyDict[] = []
  records.push(...(await searchPubmed(parsedVariant)))
  records.push(...(await searchPreprints(parsedVariant, 'biorxiv')))
  records.push(...(await searchPreprints(parsedVariant, 'medrxiv')))
  return records
}

function literatureCandidates(parsedVariant: AnyDict, records: AnyDict[]): AnyDict[] {
  const gene = parsedVariant.gene as string | undefined
  const candidates: AnyDict[] = []
  for (const record of records) {
    const text = `${record.title ?? ''} ${record.abstract ?? ''}`
    const mentions = extractVariantMentions(text)
    if (!mentions.length) {
      candidates.push({
        name: `${gene} literature candidate`,
        gene: gene ?? null,
        source: record.source ?? null,
        description: literatureDescription(record),
        clinical_significance: null,
        review_status: 'literature',
        mutation: {},
        protein_position: null,
        alternate_aa: null,
        evidence: record,
      })
      continue
    }
    for (const mention of mentions.slice(0, 3)) {
      candidates.push({
        name: `${gene} ${mention.protein_hgvs}`,
        gene: gene ?? null,
        source: record.source ?? null,
        description: literatureDescription(record),
        clinical_significance: null,
        review_status: 'literature',
        mutation: mention,
        protein_position: mention.protein_position ?? null,
        alternate_aa: mention.alternate_aa ?? null,
        evidence: record,
      })
    }
  }
  return candidates
}

function scoreCandidate(candidate: AnyDict, parsedVariant: AnyDict, annotations: AnyDict): AnyDict {
  const mutation = asDict(parsedVariant.mutation)
  const featureMutation = asDict(asDict(annotations.features).mutation)
  const inputPosition = mutation.protein_position
  const candidatePosition = candidate.protein_position

  let score = 0
  const reasons: string[] = []

  if (candidate.gene && candidate.gene === parsedVariant.gene) {
    score += 0.2
    reasons.push('same gene')
  }
  if (typeof inputPosition === 'number' && typeof candidatePosition === 'number') {
    const distance = Math.abs(inputPosition - candidatePosition)
    const residueScore = Math.max(0, 1 - Math.min(distance, 200) / 200)
    score += 0.25 * residueScore
    reasons.push(`protein positions differ by ${distance} residues`)
  } else if (
    candidate.source === 'PubMed' ||
    candidate.source === 'biorxiv' ||
    candidate.source === 'medrxiv'
  ) {
    score += 0.08
    reasons.push('same-gene literature record without extractable protein position')
  }
  if (candidate.alternate_aa === mutation.alternate_aa) {
    score += 0.12
    reasons.push('same alternate amino acid')
  } else {
    const sim = SIMILAR_AA[(mutation.alternate_aa as string) ?? ''] ?? []
    if (typeof candidate.alternate_aa === 'string' && sim.includes(candidate.alternate_aa)) {
      score += 0.1
      reasons.push('chemically similar alternate amino acid')
    }
  }
  if (typeof candidate.source === 'string' && candidate.source.includes('ClinVar')) {
    score += 0.18
    reasons.push('known ClinVar record')
  }
  if (candidate.source === 'PubMed') {
    score += 0.15
    reasons.push('candidate found in NCBI PubMed literature')
  }
  if (candidate.source === 'biorxiv' || candidate.source === 'medrxiv') {
    score += 0.12
    reasons.push('candidate found in recent preprint literature')
  }
  if (featureMutation.class_change) {
    score += 0.04
    reasons.push('input mutation changes amino-acid class')
  }
  candidate.similarity_score = Math.round(Math.min(score, 1.0) * 1000) / 1000
  candidate.similarity_reasons = reasons
  return candidate
}

function dedupeCandidates(candidates: AnyDict[]): AnyDict[] {
  const deduped = new Map<string, AnyDict>()
  for (const candidate of candidates) {
    const mutation = asDict(candidate.mutation)
    const key = JSON.stringify([
      candidate.gene ?? null,
      mutation.protein_hgvs ?? candidate.name ?? null,
      candidate.source ?? null,
    ])
    const existing = deduped.get(key)
    const existingScore = (existing?.similarity_score as number) ?? 0
    const newScore = (candidate.similarity_score as number) ?? 0
    if (!existing || newScore > existingScore) {
      deduped.set(key, candidate)
    }
  }
  return Array.from(deduped.values())
}

export async function findSimilarVariants(
  variant: AnyDict,
  annotations: AnyDict,
): Promise<AnyDict[]> {
  const parsedVariant = asDict(annotations.variant) || variant
  const candidates: AnyDict[] = []
  candidates.push(...exactClinvarCandidates(parsedVariant, annotations))

  if (liveApisEnabled()) {
    const literature = await searchLiterature(parsedVariant)
    candidates.push(...literatureCandidates(parsedVariant, literature))
    candidates.push(...(await geneClinvarCandidates(parsedVariant)))
  }

  const scored = candidates.map((c) => scoreCandidate(c, parsedVariant, annotations))
  const deduped = dedupeCandidates(scored)
  deduped.sort(
    (a, b) => ((b.similarity_score as number) ?? 0) - ((a.similarity_score as number) ?? 0),
  )
  return deduped.slice(0, 10)
}
