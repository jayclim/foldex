import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import {
  parseGeneMutationFromText,
  parseGeneMutationFromVcf,
  parseGeneMutationInput,
} from '../src/utils/geneMutationParser'

describe('geneMutationParser', () => {
  const fetcher = async (url: string) => new Response(await readFile(url))

  it('parses labeled plain text', () => {
    expect(parseGeneMutationFromText('Gene: BRAF Mutation: V600E')).toEqual({
      gene: 'BRAF',
      mutation: 'V600E',
    })
  })

  it('parses mutation-first plain text', () => {
    expect(parseGeneMutationFromText('p.Arg175His in TP53')).toEqual({
      gene: 'TP53',
      mutation: 'p.Arg175His',
    })
  })

  it('parses compact gene and mutation plain text', () => {
    expect(parseGeneMutationFromText('BRCA1 c.5266dupC')).toEqual({
      gene: 'BRCA1',
      mutation: 'c.5266dupC',
    })
  })

  it('parses an annotated VCF record', () => {
    const vcf = [
      '##fileformat=VCFv4.2',
      '##INFO=<ID=ANN,Number=.,Type=String,Description="Functional annotations: Allele|Annotation|Annotation_Impact|Gene_Name|Gene_ID|Feature_Type|Feature_ID|Transcript_BioType|Rank|HGVS.c|HGVS.p">',
      '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
      '7\t140453136\t.\tA\tT\t.\tPASS\tANN=T|missense_variant|MODERATE|BRAF|ENSG00000157764|transcript|NM_004333|protein_coding|15/18|c.1799T>A|p.Val600Glu',
    ].join('\n')

    expect(parseGeneMutationFromVcf(vcf)).toEqual({
      gene: 'BRAF',
      mutation: 'p.Val600Glu',
    })
  })

  it('parses the first variant from the sample PDF report', async () => {
    await expect(parseGeneMutationInput('tests/fixtures/genome-report-example.pdf', { fetcher })).resolves.toEqual({
      gene: 'CCDC40',
      mutation: 'c.248delC p.Ala83ValfsX84',
    })
  })

  it('rejects a VCF fixture without a gene and mutation', async () => {
    await expect(parseGeneMutationInput('tests/fixtures/gene-variant-example.vcf', { fetcher })).rejects.toThrow(
      'Could not find both a gene and a mutation',
    )
  })
})
