import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { AnalysisResult, SimilarVariantStructure } from '../api-client/analysisApi'
import { getGnomadAlleleFrequency } from './gnomad'

const MARGIN = 14
const PAGE_W = 210
const CONTENT_W = PAGE_W - MARGIN * 2
const COLOR_PRIMARY: [number, number, number] = [30, 78, 140]
const COLOR_MUTED: [number, number, number] = [110, 110, 120]
const COLOR_TEXT: [number, number, number] = [25, 25, 35]
const COLOR_DANGER: [number, number, number] = [193, 36, 36]
const COLOR_SUCCESS: [number, number, number] = [38, 138, 78]
const COLOR_WARN: [number, number, number] = [180, 120, 20]

type Cursor = { y: number }

function ensureSpace(doc: jsPDF, cursor: Cursor, needed: number) {
  if (cursor.y + needed > 285) {
    doc.addPage()
    cursor.y = 20
  }
}

function setColor(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2])
}

function heading(doc: jsPDF, cursor: Cursor, text: string, size = 14) {
  ensureSpace(doc, cursor, 12)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(size)
  setColor(doc, COLOR_PRIMARY)
  doc.text(text, MARGIN, cursor.y)
  cursor.y += 2
  doc.setDrawColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2])
  doc.setLineWidth(0.4)
  doc.line(MARGIN, cursor.y, MARGIN + CONTENT_W, cursor.y)
  cursor.y += 6
}

function paragraph(doc: jsPDF, cursor: Cursor, text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) {
  if (!text) return
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
  doc.setFontSize(opts.size ?? 10)
  setColor(doc, opts.color ?? COLOR_TEXT)
  const lines = doc.splitTextToSize(text, CONTENT_W) as string[]
  for (const line of lines) {
    ensureSpace(doc, cursor, 6)
    doc.text(line, MARGIN, cursor.y)
    cursor.y += 5
  }
}

function keyValueRow(doc: jsPDF, cursor: Cursor, key: string, value: string) {
  ensureSpace(doc, cursor, 6)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(doc, COLOR_TEXT)
  doc.text(`${key}:`, MARGIN, cursor.y)
  doc.setFont('helvetica', 'normal')
  setColor(doc, COLOR_MUTED)
  const valueLines = doc.splitTextToSize(value, CONTENT_W - 45) as string[]
  doc.text(valueLines[0] ?? '', MARGIN + 42, cursor.y)
  cursor.y += 5
  for (let i = 1; i < valueLines.length; i++) {
    ensureSpace(doc, cursor, 5)
    doc.text(valueLines[i], MARGIN + 42, cursor.y)
    cursor.y += 5
  }
}

function spacer(cursor: Cursor, n = 4) {
  cursor.y += n
}

function classificationTone(sig?: string | null): [number, number, number] {
  if (!sig) return COLOR_MUTED
  if (/pathogenic/i.test(sig)) return COLOR_DANGER
  if (/benign/i.test(sig)) return COLOR_SUCCESS
  return COLOR_WARN
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, (m) => m.trim() + ' ')
    .replace(/\|/g, ' ')
    .replace(/-{3,}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function renderMarkdown(doc: jsPDF, cursor: Cursor, md: string) {
  const cleaned = stripMarkdown(md)
  if (!cleaned) return
  for (const block of cleaned.split(/\n{2,}/)) {
    paragraph(doc, cursor, block)
    spacer(cursor, 2)
  }
}

function buildComparisonRows(result: AnalysisResult): string[][] {
  const features = result.annotations?.features
  const mut = features?.mutation
  const rows: string[][] = []
  if (!mut) return rows

  if (mut.reference_properties && mut.alternate_properties) {
    const refClass = mut.reference_properties.class ?? '—'
    const altClass = mut.alternate_properties.class ?? '—'
    rows.push([
      'Amino Acid Class',
      `${mut.reference_aa ?? '?'} (${refClass})`,
      `${mut.alternate_aa ?? '?'} (${altClass})`,
      mut.class_change ? 'Changed' : 'Same',
      mut.class_change ? 'CLASS CHANGE' : 'CONSERVATIVE',
    ])

    const hyd = mut.hydropathy_delta ?? 0
    rows.push([
      'Hydropathy (KD)',
      mut.reference_properties.hydropathy.toFixed(2),
      mut.alternate_properties.hydropathy.toFixed(2),
      `${hyd >= 0 ? '+' : ''}${hyd.toFixed(2)}`,
      Math.abs(hyd) > 2 ? 'SEVERE' : Math.abs(hyd) > 1 ? 'MODERATE' : 'MINIMAL',
    ])

    const mass = mut.mass_delta_da ?? 0
    rows.push([
      'Residue Mass (Da)',
      `${mut.reference_properties.mass.toFixed(1)} Da`,
      `${mut.alternate_properties.mass.toFixed(1)} Da`,
      `${mass >= 0 ? '+' : ''}${mass.toFixed(1)}`,
      Math.abs(mass) > 50 ? 'STERIC CHANGE' : Math.abs(mass) > 20 ? 'MODERATE' : 'MINIMAL',
    ])
  }

  if (mut.protein_position != null && features?.sequence?.length) {
    const frac = ((mut.protein_position / features.sequence.length) * 100).toFixed(0)
    rows.push([
      'Sequence Position',
      `Residue ${mut.protein_position}`,
      `${frac}% from N-term`,
      '—',
      'POSITIONAL',
    ])
  }

  if (features?.sequence?.molecular_weight_da != null) {
    rows.push([
      'Molecular Weight',
      `${(features.sequence.molecular_weight_da / 1000).toFixed(1)} kDa`,
      '(mutant)',
      '—',
      'STRUCTURAL',
    ])
  }
  if (features?.sequence?.average_hydropathy != null) {
    rows.push([
      'Avg. Hydropathy',
      features.sequence.average_hydropathy.toFixed(3),
      '—',
      '—',
      features.sequence.average_hydropathy < 0 ? 'HYDROPHILIC' : 'HYDROPHOBIC',
    ])
  }

  return rows
}

function extractClassification(result: AnalysisResult): { sig: string; confidence: string | null; tone: [number, number, number] } {
  const clinvar = result.report?.json?.classification_summary?.clinvar?.[0]
  const am = result.annotations?.alpha_missense?.predictions?.[0]
  if (clinvar?.clinical_significance) {
    const sig = clinvar.clinical_significance
    return {
      sig: sig.toUpperCase(),
      confidence: /conflicting|uncertain/i.test(sig) ? 'Uncertain' : 'Confident',
      tone: classificationTone(sig),
    }
  }
  if (am) {
    const sig = am.prediction.replace('likely_', 'Likely ').replace('_', ' ')
    return {
      sig: sig.toUpperCase(),
      confidence: am.prediction === 'ambiguous' ? 'Uncertain' : 'Confident',
      tone: classificationTone(am.prediction),
    }
  }
  return { sig: 'UNCERTAIN SIGNIFICANCE', confidence: null, tone: COLOR_MUTED }
}

function drawHeader(doc: jsPDF, cursor: Cursor, result: AnalysisResult, completedAt?: string | null) {
  doc.setFillColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2])
  doc.rect(0, 0, PAGE_W, 22, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(255, 255, 255)
  doc.text('FoldEx — Variant Analysis Report', MARGIN, 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const generated = completedAt
    ? new Date(completedAt).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      })
    : new Date().toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      })
  doc.text(`Generated: ${generated}`, MARGIN, 18)

  cursor.y = 32

  const display = result.variant?.display_name ?? `${result.variant?.gene ?? 'Unknown'}`
  const gene = result.variant?.gene ?? ''
  const protein = result.report?.json?.wild_type?.protein ?? ''

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  setColor(doc, COLOR_TEXT)
  doc.text(`${gene}${protein ? ` — ${protein}` : ''}`, MARGIN, cursor.y)
  cursor.y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  setColor(doc, COLOR_MUTED)
  doc.text(`Variant: ${display}`, MARGIN, cursor.y)
  cursor.y += 8

  const { sig, confidence, tone } = extractClassification(result)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(doc, COLOR_TEXT)
  doc.text('Clinical Significance:', MARGIN, cursor.y)
  setColor(doc, tone)
  doc.text(sig + (confidence ? `  (${confidence})` : ''), MARGIN + 48, cursor.y)
  cursor.y += 7
}

function drawDisclaimer(doc: jsPDF) {
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    setColor(doc, COLOR_MUTED)
    doc.text(
      'FoldEx is a research-support tool, not a diagnostic device. Every output must be reviewed by a qualified clinician or geneticist.',
      MARGIN,
      292,
      { maxWidth: CONTENT_W },
    )
    doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN, 292, { align: 'right' })
  }
}

function drawSummarySection(doc: jsPDF, cursor: Cursor, result: AnalysisResult) {
  heading(doc, cursor, 'Summary')
  const wildDesc = result.report?.json?.wild_type?.description
  const variantDesc = result.report?.json?.unknown_variant?.description
  const interp = result.report?.json?.classification_summary?.overall_interpretation

  if (wildDesc) {
    paragraph(doc, cursor, 'Wild Type', { bold: true, color: COLOR_PRIMARY })
    paragraph(doc, cursor, wildDesc)
    spacer(cursor)
  }
  if (variantDesc) {
    paragraph(doc, cursor, 'Variant', { bold: true, color: COLOR_PRIMARY })
    paragraph(doc, cursor, variantDesc)
    spacer(cursor)
  }
  if (interp) {
    paragraph(doc, cursor, 'Overall interpretation', { bold: true, color: COLOR_PRIMARY })
    paragraph(doc, cursor, interp)
    spacer(cursor)
  }
}

function drawAnnotationsSection(doc: jsPDF, cursor: Cursor, result: AnalysisResult) {
  const ann = result.annotations
  if (!ann) return
  heading(doc, cursor, 'Annotations & Evidence')

  const variant = result.variant
  if (variant?.mutation) {
    paragraph(doc, cursor, 'Variant identifiers', { bold: true, color: COLOR_PRIMARY })
    if (variant.mutation.cdna_hgvs) keyValueRow(doc, cursor, 'cDNA HGVS', variant.mutation.cdna_hgvs)
    if (variant.mutation.protein_hgvs) keyValueRow(doc, cursor, 'Protein HGVS', variant.mutation.protein_hgvs)
    if (variant.mutation.protein_position != null) {
      keyValueRow(
        doc,
        cursor,
        'Position',
        `${variant.mutation.reference_aa ?? '?'}${variant.mutation.protein_position} → ${variant.mutation.alternate_aa ?? '?'}${variant.mutation.protein_position}`,
      )
    }
    spacer(cursor)
  }

  const am = ann.alpha_missense?.predictions?.[0]
  if (am) {
    paragraph(doc, cursor, 'AlphaMissense', { bold: true, color: COLOR_PRIMARY })
    keyValueRow(doc, cursor, 'Prediction', am.prediction)
    keyValueRow(doc, cursor, 'Score', am.score.toFixed(3))
    if (am.transcript_id) keyValueRow(doc, cursor, 'Transcript', am.transcript_id)
    spacer(cursor)
  }

  const clinvar = ann.clinvar?.records ?? []
  if (clinvar.length) {
    paragraph(doc, cursor, 'ClinVar', { bold: true, color: COLOR_PRIMARY })
    for (const rec of clinvar.slice(0, 5)) {
      if (rec.title) keyValueRow(doc, cursor, 'Title', rec.title)
      if (rec.clinical_significance) keyValueRow(doc, cursor, 'Significance', rec.clinical_significance)
      if (rec.review_status) keyValueRow(doc, cursor, 'Review status', rec.review_status)
      spacer(cursor, 2)
    }
  }

  const af = getGnomadAlleleFrequency(ann.gnomad)
  if (af != null || ann.gnomad?.population_frequency_source) {
    paragraph(doc, cursor, 'gnomAD population frequency', { bold: true, color: COLOR_PRIMARY })
    if (af != null) keyValueRow(doc, cursor, 'Allele frequency', af.toExponential(3))
    if (ann.gnomad?.population_frequency_source) {
      keyValueRow(doc, cursor, 'Source', String(ann.gnomad.population_frequency_source))
    }
    spacer(cursor)
  }

  const uniprot = ann.uniprot
  if (uniprot && (uniprot.protein_name || uniprot.accession)) {
    paragraph(doc, cursor, 'UniProt', { bold: true, color: COLOR_PRIMARY })
    if (uniprot.protein_name) keyValueRow(doc, cursor, 'Protein', uniprot.protein_name)
    if (uniprot.accession) keyValueRow(doc, cursor, 'Accession', uniprot.accession)
    if (uniprot.length != null) keyValueRow(doc, cursor, 'Length', `${uniprot.length} aa`)
    if (uniprot.domains?.length) {
      keyValueRow(
        doc,
        cursor,
        'Domains',
        uniprot.domains.slice(0, 4).map((d) => `${d.description} (${d.start}-${d.end})`).join('; '),
      )
    }
    if (uniprot.function?.length) {
      keyValueRow(doc, cursor, 'Function', uniprot.function.slice(0, 2).join(' '))
    }
    spacer(cursor)
  }

  const seq = ann.features?.sequence
  if (seq) {
    paragraph(doc, cursor, 'Sequence properties', { bold: true, color: COLOR_PRIMARY })
    if (seq.length != null) keyValueRow(doc, cursor, 'Length', `${seq.length} aa`)
    if (seq.molecular_weight_da != null) {
      keyValueRow(doc, cursor, 'Molecular weight', `${(seq.molecular_weight_da / 1000).toFixed(2)} kDa`)
    }
    if (seq.average_hydropathy != null) {
      keyValueRow(doc, cursor, 'Avg. hydropathy', seq.average_hydropathy.toFixed(3))
    }
    spacer(cursor)
  }
}

function drawComparisonTable(doc: jsPDF, cursor: Cursor, result: AnalysisResult) {
  const rows = buildComparisonRows(result)
  if (!rows.length) return
  heading(doc, cursor, 'Wild Type vs. Variant Comparison')

  autoTable(doc, {
    startY: cursor.y,
    head: [['Parameter', 'Wild Type', 'Variant', 'Delta', 'Impact']],
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: COLOR_TEXT },
    headStyles: { fillColor: COLOR_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    theme: 'grid',
  })

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursor.y
  cursor.y = finalY + 8
}

function drawSimilarVariants(doc: jsPDF, cursor: Cursor, similar: SimilarVariantStructure[]) {
  if (!similar.length) return
  heading(doc, cursor, 'Similar Known Variants')

  const rows = similar.slice(0, 10).map((sv) => {
    const v = sv.variant
    return [
      v?.name ?? '—',
      v?.gene ?? '—',
      v?.clinical_significance ?? '—',
      v?.similarity_score != null ? `${Math.round(v.similarity_score * 100)}%` : '—',
      (v?.similarity_reasons ?? []).join('; ') || v?.description || '—',
    ]
  })

  autoTable(doc, {
    startY: cursor.y,
    head: [['Variant', 'Gene', 'Classification', 'Similarity', 'Why similar / description']],
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.5, textColor: COLOR_TEXT, valign: 'top' },
    headStyles: { fillColor: COLOR_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 18 },
      2: { cellWidth: 28 },
      3: { cellWidth: 20 },
      4: { cellWidth: 'auto' },
    },
    theme: 'grid',
  })

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursor.y
  cursor.y = finalY + 8
}

function drawFullReport(doc: jsPDF, cursor: Cursor, markdown: string) {
  if (!markdown.trim()) return
  heading(doc, cursor, 'Full Report')
  renderMarkdown(doc, cursor, markdown)
  spacer(cursor)
}

function drawPatientSummary(doc: jsPDF, cursor: Cursor, summary: string) {
  if (!summary.trim()) return
  heading(doc, cursor, 'For the Patient')
  renderMarkdown(doc, cursor, summary)
  spacer(cursor)
}

function drawWarnings(doc: jsPDF, cursor: Cursor, warnings: string[]) {
  if (!warnings.length) return
  heading(doc, cursor, 'Warnings')
  for (const w of warnings) {
    paragraph(doc, cursor, `• ${w}`, { color: COLOR_WARN })
  }
  spacer(cursor)
}

function safeFilename(result: AnalysisResult): string {
  const raw = result.variant?.display_name ?? `${result.variant?.gene ?? 'variant'}`
  const slug = raw.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'variant'
  return `foldex_${slug}_report.pdf`
}

export function generatePdfReport(result: AnalysisResult, completedAt?: string | null): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const cursor: Cursor = { y: 20 }

  drawHeader(doc, cursor, result, completedAt)
  spacer(cursor, 2)

  drawSummarySection(doc, cursor, result)
  drawAnnotationsSection(doc, cursor, result)
  drawComparisonTable(doc, cursor, result)

  const similar = result.structures?.similar_variants ?? []
  drawSimilarVariants(doc, cursor, similar)

  if (result.report?.markdown) drawFullReport(doc, cursor, result.report.markdown)
  if (result.report?.patient_summary) drawPatientSummary(doc, cursor, result.report.patient_summary)

  const warnings = [
    ...(result.annotations?.warnings ?? []),
    ...(result.annotations?.features?.warnings ?? []),
    ...(result.report?.json?.warnings ?? []),
  ]
  drawWarnings(doc, cursor, warnings)

  drawDisclaimer(doc)
  doc.save(safeFilename(result))
}
