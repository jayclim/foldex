export type GeneMutation = {
  gene: string
  mutation: string
}

export type GeneMutationParserOptions = {
  fetcher?: (url: string) => Promise<Response>
}

type FileKind = 'pdf' | 'vcf'

const aminoAcidCodes = [
  'Ala',
  'Arg',
  'Asn',
  'Asp',
  'Cys',
  'Gln',
  'Glu',
  'Gly',
  'His',
  'Ile',
  'Leu',
  'Lys',
  'Met',
  'Phe',
  'Pro',
  'Ser',
  'Thr',
  'Trp',
  'Tyr',
  'Val',
]
const aminoAcidTokenSource = `(?:${aminoAcidCodes.join('|')}|[A-Z])`
const geneTokenSource = String.raw`[A-Z][A-Z0-9]{1,15}(?:-[A-Z0-9]{1,10})?`
const mutationTokenSource = [
  String.raw`chr(?:[0-9]{1,2}|X|Y|M|MT):g\.[A-Za-z0-9_.:+*>\-<]+`,
  String.raw`[cgmnr]\.[A-Za-z0-9_.:+*>\-<]+`,
  String.raw`p\.${aminoAcidTokenSource}\d+(?:${aminoAcidTokenSource}(?:fs(?:Ter|X|\*)?\d*)?|Ter|X|\*|=|del|dup|ins[A-Za-z*]+|fs(?:Ter|X|\*)?\d*)`,
  String.raw`${aminoAcidTokenSource}\d+(?:${aminoAcidTokenSource}(?:fs(?:Ter|X|\*)?\d*)?|Ter|X|\*|=|del|dup|ins[A-Za-z*]+|fs(?:Ter|X|\*)?\d*)`,
].join('|')

const commonNonGeneWords = new Set([
  'ALT',
  'CHROM',
  'CLINVAR',
  'CODING',
  'EXON',
  'FILTER',
  'GENE',
  'HGVS',
  'HGVSC',
  'HGVSP',
  'INFO',
  'MUTATION',
  'PATIENT',
  'PDF',
  'POS',
  'PROTEIN',
  'QUAL',
  'REF',
  'SAMPLE',
  'TRANSCRIPT',
  'VARIANT',
  'VCF',
])

const infoGeneKeys = [
  'GENE',
  'Gene',
  'SYMBOL',
  'HGNC',
  'GENENAME',
  'GENEINFO',
  'Gene_Name',
]

const infoMutationKeys = [
  'HGVSP',
  'HGVSp',
  'HGVS_P',
  'HGVS.p',
  'AAChange',
  'AACHANGE',
  'Protein',
  'MUTATION',
  'Variant',
  'HGVSC',
  'HGVSc',
  'HGVS_C',
  'HGVS.c',
]

const annDefaultFields = [
  'Allele',
  'Annotation',
  'Annotation_Impact',
  'Gene_Name',
  'Gene_ID',
  'Feature_Type',
  'Feature_ID',
  'Transcript_BioType',
  'Rank',
  'HGVS.c',
  'HGVS.p',
]

const csqDefaultFields = [
  'Allele',
  'Consequence',
  'IMPACT',
  'SYMBOL',
  'Gene',
  'Feature_type',
  'Feature',
  'BIOTYPE',
  'EXON',
  'INTRON',
  'HGVSc',
  'HGVSp',
]

export async function parseGeneMutationInput(
  input: string,
  options: GeneMutationParserOptions = {},
): Promise<GeneMutation> {
  const trimmedInput = input.trim()

  if (!trimmedInput) {
    throw new Error('Input is empty. Provide plain text or a URL to a .vcf or .pdf file.')
  }

  const fileKind = getFileKind(trimmedInput)

  if (fileKind === 'vcf') {
    const vcfText = await fetchText(trimmedInput, options.fetcher)
    return parseGeneMutationFromVcf(vcfText)
  }

  if (fileKind === 'pdf') {
    const pdfBytes = await fetchBytes(trimmedInput, options.fetcher)
    return parseGeneMutationFromPdfBytes(pdfBytes)
  }

  return parseGeneMutationFromText(trimmedInput)
}

export function parseGeneMutationFromText(text: string): GeneMutation {
  const parsed = tryParseGeneMutationFromText(text)

  if (!parsed) {
    throw new Error('Could not find both a gene and a mutation in the provided input.')
  }

  return parsed
}

export function parseGeneMutationFromVcf(vcfText: string): GeneMutation {
  const lines = vcfText.split(/\r?\n/)
  const annotationFormats = {
    ANN: findAnnotationFormat(lines, 'ANN') ?? annDefaultFields,
    CSQ: findAnnotationFormat(lines, 'CSQ') ?? csqDefaultFields,
  }

  for (const line of lines) {
    if (!line || line.startsWith('#')) {
      continue
    }

    const columns = line.split('\t')
    if (columns.length < 8) {
      continue
    }

    const [chrom, pos, id, ref, alt, , , info] = columns
    const infoMap = parseVcfInfo(info)
    const parsedAnnotation = parseVcfAnnotations(infoMap, annotationFormats)

    if (parsedAnnotation) {
      return parsedAnnotation
    }

    const directGene = pickFirstInfoValue(infoMap, infoGeneKeys)
    const directMutation = pickFirstInfoValue(infoMap, infoMutationKeys)

    if (directGene && directMutation) {
      return {
        gene: cleanGene(directGene),
        mutation: cleanMutation(directMutation),
      }
    }

    if (directGene) {
      return {
        gene: cleanGene(directGene),
        mutation: buildGenomicMutation(chrom, pos, ref, alt),
      }
    }

    const parsedInfoText = tryParseGeneMutationFromText(`${id} ${info}`)
    if (parsedInfoText) {
      return parsedInfoText
    }
  }

  return parseGeneMutationFromText(vcfText)
}

export async function parseGeneMutationFromPdfBytes(pdfBytes: ArrayBuffer): Promise<GeneMutation> {
  const pdfText = await extractTextFromPdf(pdfBytes)
  return parseGeneMutationFromPdfText(pdfText)
}

export function parseGeneMutationFromPdfText(pdfText: string): GeneMutation {
  const reportVariant = tryParseFirstReportVariant(pdfText)

  if (reportVariant) {
    return reportVariant
  }

  return parseGeneMutationFromText(normalizePdfTextForParsing(pdfText))
}

async function fetchText(
  url: string,
  fetcher = getDefaultFetcher(),
): Promise<string> {
  const response = await fetchUrl(url, fetcher)
  return response.text()
}

async function fetchBytes(
  url: string,
  fetcher = getDefaultFetcher(),
): Promise<ArrayBuffer> {
  const response = await fetchUrl(url, fetcher)
  return response.arrayBuffer()
}

function getDefaultFetcher(): GeneMutationParserOptions['fetcher'] | undefined {
  if (typeof globalThis.fetch !== 'function') {
    return undefined
  }

  return (url: string) => globalThis.fetch(url)
}

async function fetchUrl(
  url: string,
  fetcher: ((url: string) => Promise<Response>) | undefined,
): Promise<Response> {
  if (!fetcher) {
    throw new Error('Fetching files is not available in this environment.')
  }

  const response = await fetcher(url)

  if (!response.ok) {
    throw new Error(`Could not fetch "${url}". The server returned ${response.status}.`)
  }

  return response
}

function getFileKind(input: string): FileKind | null {
  if (/\s/.test(input)) {
    return null
  }

  const pathWithoutQuery = input.split(/[?#]/, 1)[0].toLowerCase()

  if (pathWithoutQuery.endsWith('.vcf')) {
    return 'vcf'
  }

  if (pathWithoutQuery.endsWith('.pdf')) {
    return 'pdf'
  }

  return null
}

function tryParseGeneMutationFromText(text: string): GeneMutation | null {
  const normalizedText = normalizeText(text)

  if (!normalizedText) {
    return null
  }

  const labeledGene = matchFirst(
    normalizedText,
    /\b(?:gene|symbol|gene_name|hgnc)\s*[:=]\s*([A-Z][A-Z0-9-]{1,25})\b/i,
  )
  const labeledMutation = matchFirst(
    normalizedText,
    new RegExp(
      String.raw`\b(?:mutation|variant|alteration|hgvs|hgvsp|hgvsc|protein\s*change|aa\s*change)\s*[:=]\s*(${mutationTokenSource})`,
      'i',
    ),
  )

  if (labeledGene && labeledMutation) {
    return {
      gene: cleanGene(labeledGene),
      mutation: cleanMutation(labeledMutation),
    }
  }

  const geneThenMutation = matchPair(
    normalizedText,
    new RegExp(
      String.raw`\b(${geneTokenSource})\b\s*(?:[|,:;=]|\s+)\s*(${mutationTokenSource})\b`,
      'i',
    ),
  )

  if (geneThenMutation) {
    return geneThenMutation
  }

  const mutationThenGene = matchPair(
    normalizedText,
    new RegExp(
      String.raw`\b(${mutationTokenSource})\b(?:\s+(?:in|of|for|on)\s+|\s*[,;|]\s*)(${geneTokenSource})\b`,
      'i',
    ),
    true,
  )

  if (mutationThenGene) {
    return mutationThenGene
  }

  const nearbyParsed = parseNearbyUppercaseGeneAndMutation(normalizedText)

  if (nearbyParsed) {
    return nearbyParsed
  }

  return null
}

function tryParseFirstReportVariant(text: string): GeneMutation | null {
  const reportText = normalizePdfTextForParsing(text)
  const rowRegex = new RegExp(
    String.raw`\b((?:[A-Z0-9]\s*){2,25})\s+N\s*M\s*_\s*\d(?:[\d\s]*)(?:\.\s*\d+)?\s+(.{0,220}?)(?=\s+(?:H\s*e\s*t|Heterozygous|H\s*o\s*m|Homozygous|Hemizygous|Pathogenic|Likely|Benign|VUS|Uncertain)\b|\s+(?:[A-Z0-9]\s*){2,25}\s+N\s*M\s*_|\s*$)`,
    'gi',
  )
  const matches = [...reportText.matchAll(rowRegex)]

  for (const match of matches) {
    const gene = compactGeneCandidate(match[1])
    const mutation = extractReportMutation(match[2])

    if (gene && mutation) {
      return { gene, mutation }
    }
  }

  return null
}

function normalizePdfTextForParsing(text: string): string {
  return text
    .replace(/[^\x20-\x7e]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactGeneCandidate(value: string): string | null {
  const suffixStart = Math.max(value.search(/[a-z][^a-z]*$/) + 1, 0)
  const likelyGene = value.slice(suffixStart).trim() || value
  const gene = likelyGene.replace(/[^A-Za-z0-9-]/g, '').toUpperCase()

  if (!gene || isCommonNonGeneWord(gene) || !new RegExp(`^${geneTokenSource}$`).test(gene)) {
    return null
  }

  return gene
}

function extractReportMutation(segment: string): string | null {
  const normalizedSegment = normalizeReportVariantSegment(segment)
  const mutations = collectMutationTokens(normalizedSegment)

  if (!mutations.length) {
    return null
  }

  return mutations.slice(0, 2).join(' ')
}

function normalizeReportVariantSegment(segment: string): string {
  let normalizedSegment = normalizePdfTextForParsing(segment)
    .replace(/\b([cgmnrp])\s*\.\s*/gi, (_match, prefix: string) => `${prefix.toLowerCase()}.`)
    .replace(/\b([NLR])\s*M\s*_\s*/gi, (_match, prefix: string) => `${prefix.toUpperCase()}M_`)

  for (const aminoAcidCode of aminoAcidCodes) {
    const spacedCode = aminoAcidCode
      .split('')
      .map((char) => `${char}\\s*`)
      .join('')
    normalizedSegment = normalizedSegment.replace(new RegExp(spacedCode, 'gi'), aminoAcidCode)
  }

  return normalizedSegment
    .replace(/d\s*e\s*l/gi, 'del')
    .replace(/d\s*u\s*p/gi, 'dup')
    .replace(/i\s*n\s*s/gi, 'ins')
    .replace(/f\s*s/gi, 'fs')
    .replace(/\bT\s*e\s*r\b/gi, 'Ter')
}

function collectMutationTokens(segment: string): string[] {
  const tokens = segment
    .split(/\s+/)
    .map((token) => token.replace(/^[([{,;:]+|[)\]},;:]+$/g, ''))
    .filter(Boolean)
  const mutations: string[] = []
  let index = 0

  while (index < tokens.length) {
    const token = tokens[index]

    if (!isMutationStartToken(token)) {
      index += 1
      continue
    }

    let mutation = token
    index += 1

    while (index < tokens.length && isMutationContinuationToken(tokens[index], mutation)) {
      mutation += tokens[index]
      index += 1
    }

    if (isValidMutationToken(mutation)) {
      mutations.push(cleanMutation(mutation))
    }
  }

  return mutations
}

function isMutationStartToken(token: string): boolean {
  return /^(?:chr(?:[0-9]{1,2}|X|Y|M|MT):g\.|[cgmnrp]\.)/i.test(token)
}

function isMutationContinuationToken(token: string, currentMutation: string): boolean {
  if (isReportStopToken(token) || isMutationStartToken(token)) {
    return false
  }

  if (!/^[A-Za-z0-9_.:+*>\-<]+$/.test(token)) {
    return false
  }

  if (currentMutation.endsWith('>')) {
    return /^[ACGTN]+$/i.test(token)
  }

  if (/^p\./i.test(currentMutation)) {
    return /^(?:\d+[A-Z*X]+|(?:Ter|[A-Z*X])\d+|fs(?:Ter|X|\*)?\d*)$/i.test(token)
  }

  return /^(?:[ACGTN]+|del[A-Za-z0-9]*|dup[A-Za-z0-9]*|ins[A-Za-z0-9*]+|\d+[A-Za-z0-9_+*>\-<]*)$/i.test(token)
}

function isReportStopToken(token: string): boolean {
  return /^(?:Heterozygous|Homozygous|Hemizygous|Pathogenic|Likely|Benign|VUS|Uncertain|Carrier)$/i.test(token)
}

function isValidMutationToken(token: string): boolean {
  return new RegExp(`^(?:${mutationTokenSource})$`, 'i').test(token)
}

function parseNearbyUppercaseGeneAndMutation(text: string): GeneMutation | null {
  const mutationRegex = new RegExp(String.raw`\b(${mutationTokenSource})\b`, 'i')
  const mutationMatch = mutationRegex.exec(text)

  if (!mutationMatch) {
    return null
  }

  const searchWindow = text.slice(Math.max(0, mutationMatch.index - 120), mutationMatch.index + 120)
  const geneRegex = new RegExp(String.raw`\b(${geneTokenSource})\b`, 'g')
  const geneMatches = [...searchWindow.matchAll(geneRegex)]
    .map((match) => match[1])
    .filter((gene) => !isCommonNonGeneWord(gene))

  if (!geneMatches.length) {
    return null
  }

  return {
    gene: cleanGene(geneMatches.at(-1) ?? geneMatches[0]),
    mutation: cleanMutation(mutationMatch[1]),
  }
}

function matchPair(text: string, regex: RegExp, reversed = false): GeneMutation | null {
  const match = regex.exec(text)

  if (!match) {
    return null
  }

  const gene = reversed ? match[2] : match[1]
  const mutation = reversed ? match[1] : match[2]

  if (isCommonNonGeneWord(gene)) {
    return null
  }

  return {
    gene: cleanGene(gene),
    mutation: cleanMutation(mutation),
  }
}

function matchFirst(text: string, regex: RegExp): string | null {
  return regex.exec(text)?.[1] ?? null
}

function normalizeText(text: string): string {
  return text
    .split('\u0000')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanGene(gene: string): string {
  const geneName = safeDecode(gene)
    .replace(/^[([{]+|[)\]},.;]+$/g, '')
    .split(':')[0]
    .trim()
    .toUpperCase()

  if (isCommonNonGeneWord(geneName)) {
    throw new Error(`"${geneName}" does not look like a gene symbol.`)
  }

  return geneName
}

function cleanMutation(mutation: string): string {
  return safeDecode(mutation)
    .replace(/^[([{]+|[)\]},;]+$/g, '')
    .trim()
}

function isCommonNonGeneWord(value: string): boolean {
  return commonNonGeneWords.has(value.toUpperCase())
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseVcfInfo(info: string): Map<string, string> {
  const infoMap = new Map<string, string>()

  for (const field of info.split(';')) {
    const [rawKey, ...rawValueParts] = field.split('=')
    const key = rawKey.trim()

    if (!key) {
      continue
    }

    infoMap.set(key, rawValueParts.length ? rawValueParts.join('=').trim() : 'true')
  }

  return infoMap
}

function pickFirstInfoValue(infoMap: Map<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = infoMap.get(key)

    if (isUsefulVcfValue(value)) {
      return value.split(/[,&]/, 1)[0]
    }
  }

  return null
}

function findAnnotationFormat(lines: string[], id: 'ANN' | 'CSQ'): string[] | null {
  const infoLine = lines.find((line) => line.startsWith(`##INFO=<ID=${id},`))
  const formatMatch = infoLine?.match(/Format:\s*([^">]+)/i)

  if (!formatMatch) {
    return null
  }

  return formatMatch[1].split('|').map((field) => field.trim())
}

function parseVcfAnnotations(
  infoMap: Map<string, string>,
  annotationFormats: Record<'ANN' | 'CSQ', string[]>,
): GeneMutation | null {
  for (const id of ['ANN', 'CSQ'] as const) {
    const rawAnnotations = infoMap.get(id)

    if (!rawAnnotations) {
      continue
    }

    for (const rawAnnotation of rawAnnotations.split(',')) {
      const parsed = parseDelimitedAnnotation(rawAnnotation, annotationFormats[id])

      if (parsed) {
        return parsed
      }
    }
  }

  return null
}

function parseDelimitedAnnotation(rawAnnotation: string, fields: string[]): GeneMutation | null {
  const values = rawAnnotation.split('|')
  const fieldMap = new Map<string, string>()

  fields.forEach((field, index) => {
    fieldMap.set(field, values[index] ?? '')
  })

  const gene =
    findFirstFieldValue(fieldMap, ['SYMBOL', 'Gene_Name', 'GENE', 'Gene']) ??
    findFirstFieldValue(fieldMap, ['Gene_ID'])
  const mutation =
    findFirstFieldValue(fieldMap, ['HGVSp', 'HGVS.p']) ??
    findFirstFieldValue(fieldMap, ['HGVSc', 'HGVS.c'])

  if (!gene || !mutation) {
    return null
  }

  return {
    gene: cleanGene(gene),
    mutation: cleanMutation(mutation),
  }
}

function findFirstFieldValue(fieldMap: Map<string, string>, fieldNames: string[]): string | null {
  for (const fieldName of fieldNames) {
    const value = fieldMap.get(fieldName)

    if (isUsefulVcfValue(value)) {
      return value
    }
  }

  return null
}

function isUsefulVcfValue(value: string | undefined): value is string {
  return Boolean(value && value !== '.' && value !== '-')
}

function buildGenomicMutation(chrom: string, pos: string, ref: string, alt: string): string {
  const firstAlt = alt.split(',', 1)[0]
  return `${chrom}:g.${pos}${ref}>${firstAlt}`
}

async function extractTextFromPdf(pdfBytes: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(pdfBytes)
  const pdfSource = decodePdfBytes(bytes)
  const streamTexts = await extractPdfStreamTexts(bytes, pdfSource)
  const fallbackText = streamTexts.length ? '' : readPdfStrings(pdfSource).join(' ')
  const text = normalizeText([...streamTexts, fallbackText].join(' '))

  if (!text) {
    throw new Error('No readable text was found in the PDF. Scanned or encrypted PDFs need OCR/server-side parsing.')
  }

  return text
}

async function extractPdfStreamTexts(bytes: Uint8Array, source: string): Promise<string[]> {
  const texts: string[] = []
  let searchIndex = 0

  while (searchIndex < source.length) {
    const streamIndex = source.indexOf('stream', searchIndex)

    if (streamIndex === -1) {
      break
    }

    const endStreamIndex = source.indexOf('endstream', streamIndex)

    if (endStreamIndex === -1) {
      break
    }

    const dictionaryStart = source.lastIndexOf('<<', streamIndex)
    const dictionaryEnd = source.lastIndexOf('>>', streamIndex)
    const dictionary =
      dictionaryStart !== -1 && dictionaryEnd !== -1 && dictionaryEnd > dictionaryStart
        ? source.slice(dictionaryStart, dictionaryEnd + 2)
        : ''
    const streamStart = skipStreamLineBreak(source, streamIndex + 'stream'.length)
    const streamEnd = trimPdfStreamEnd(bytes, streamStart, endStreamIndex)
    const streamBytes = bytes.slice(streamStart, streamEnd)
    const decodedStream = await decodePdfStream(streamBytes, dictionary)

    if (decodedStream) {
      texts.push(...readPdfStrings(decodePdfBytes(decodedStream)))
    }

    searchIndex = endStreamIndex + 'endstream'.length
  }

  return texts.filter(Boolean)
}

async function decodePdfStream(streamBytes: Uint8Array, dictionary: string): Promise<Uint8Array | null> {
  if (!/\/Filter\b/.test(dictionary)) {
    return streamBytes
  }

  if (/\/FlateDecode\b/.test(dictionary)) {
    return inflatePdfStream(streamBytes)
  }

  return null
}

async function inflatePdfStream(streamBytes: Uint8Array): Promise<Uint8Array | null> {
  if (!('DecompressionStream' in globalThis)) {
    return null
  }

  for (const format of ['deflate', 'deflate-raw'] as CompressionFormat[]) {
    try {
      const streamBuffer = new ArrayBuffer(streamBytes.byteLength)
      new Uint8Array(streamBuffer).set(streamBytes)

      const stream = new Blob([streamBuffer]).stream().pipeThrough(new DecompressionStream(format))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    } catch {
      // Try the next deflate flavor. PDF FlateDecode is usually zlib-wrapped,
      // but some generators produce raw deflate streams.
    }
  }

  return null
}

function skipStreamLineBreak(source: string, index: number): number {
  if (source[index] === '\r' && source[index + 1] === '\n') {
    return index + 2
  }

  if (source[index] === '\n' || source[index] === '\r') {
    return index + 1
  }

  return index
}

function trimPdfStreamEnd(bytes: Uint8Array, streamStart: number, endStreamIndex: number): number {
  let streamEnd = endStreamIndex

  while (streamEnd > streamStart && (bytes[streamEnd - 1] === 0x0a || bytes[streamEnd - 1] === 0x0d)) {
    streamEnd -= 1
  }

  return streamEnd
}

function readPdfStrings(source: string): string[] {
  const strings: string[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]

    if (char === '(') {
      const parsed = readPdfLiteralString(source, index)

      if (parsed.value) {
        strings.push(parsed.value)
      }

      index = parsed.nextIndex
      continue
    }

    if (char === '<' && source[index + 1] !== '<') {
      const parsed = readPdfHexString(source, index)

      if (parsed.value) {
        strings.push(parsed.value)
      }

      index = parsed.nextIndex
      continue
    }

    index += 1
  }

  return strings
}

function readPdfLiteralString(source: string, startIndex: number): { value: string; nextIndex: number } {
  let depth = 1
  let index = startIndex + 1
  let value = ''

  while (index < source.length && depth > 0) {
    const char = source[index]

    if (char === '\\') {
      const escaped = readPdfEscape(source, index)
      value += escaped.value
      index = escaped.nextIndex
      continue
    }

    if (char === '(') {
      depth += 1
      value += char
      index += 1
      continue
    }

    if (char === ')') {
      depth -= 1

      if (depth > 0) {
        value += char
      }

      index += 1
      continue
    }

    value += char
    index += 1
  }

  return {
    value: decodeMaybeUtf16(value),
    nextIndex: index,
  }
}

function readPdfEscape(source: string, escapeIndex: number): { value: string; nextIndex: number } {
  const escapedChar = source[escapeIndex + 1]

  if (!escapedChar) {
    return { value: '', nextIndex: escapeIndex + 1 }
  }

  if (/[0-7]/.test(escapedChar)) {
    const octal = source.slice(escapeIndex + 1, escapeIndex + 4).match(/^[0-7]{1,3}/)?.[0] ?? ''
    return {
      value: String.fromCharCode(Number.parseInt(octal, 8)),
      nextIndex: escapeIndex + 1 + octal.length,
    }
  }

  const escapes: Record<string, string> = {
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    '\\': '\\',
    '(': '(',
    ')': ')',
  }

  if (escapedChar === '\r' && source[escapeIndex + 2] === '\n') {
    return { value: '', nextIndex: escapeIndex + 3 }
  }

  if (escapedChar === '\n' || escapedChar === '\r') {
    return { value: '', nextIndex: escapeIndex + 2 }
  }

  return {
    value: escapes[escapedChar] ?? escapedChar,
    nextIndex: escapeIndex + 2,
  }
}

function readPdfHexString(source: string, startIndex: number): { value: string; nextIndex: number } {
  const endIndex = source.indexOf('>', startIndex + 1)

  if (endIndex === -1) {
    return { value: '', nextIndex: source.length }
  }

  const hex = source.slice(startIndex + 1, endIndex).replace(/\s+/g, '')
  const normalizedHex = hex.length % 2 === 0 ? hex : `${hex}0`
  const bytes = new Uint8Array(normalizedHex.length / 2)

  for (let index = 0; index < normalizedHex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalizedHex.slice(index, index + 2), 16)
  }

  return {
    value: decodePdfBytes(bytes),
    nextIndex: endIndex + 1,
  }
}

function decodeMaybeUtf16(value: string): string {
  if (value.charCodeAt(0) === 0xfe && value.charCodeAt(1) === 0xff) {
    const bytes = new Uint8Array(value.length - 2)

    for (let index = 2; index < value.length; index += 1) {
      bytes[index - 2] = value.charCodeAt(index) & 0xff
    }

    return new TextDecoder('utf-16be').decode(bytes)
  }

  if (value.charCodeAt(0) === 0xff && value.charCodeAt(1) === 0xfe) {
    const bytes = new Uint8Array(value.length - 2)

    for (let index = 2; index < value.length; index += 1) {
      bytes[index - 2] = value.charCodeAt(index) & 0xff
    }

    return new TextDecoder('utf-16le').decode(bytes)
  }

  return value
}

function decodePdfBytes(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}
