type FrequencyLike = {
  population_frequency?: unknown
  population_frequencies?: unknown
}

export function getGnomadAlleleFrequency(gnomad?: FrequencyLike | null): number | null {
  if (!gnomad) {
    return null
  }

  const direct = extractFrequencyValue(gnomad.population_frequency)
  if (direct != null) {
    return direct
  }

  return extractFrequencyValue(gnomad.population_frequencies)
}

function extractFrequencyValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  if (typeof record.allele_frequency === 'number' && Number.isFinite(record.allele_frequency)) {
    return record.allele_frequency
  }

  const nested = Object.values(record)
    .map((item) => {
      if (typeof item === 'number' && Number.isFinite(item)) {
        return item
      }
      if (item && typeof item === 'object') {
        const alleleFrequency = (item as Record<string, unknown>).allele_frequency
        return typeof alleleFrequency === 'number' && Number.isFinite(alleleFrequency)
          ? alleleFrequency
          : null
      }
      return null
    })
    .filter((item): item is number => item != null)

  return nested.length ? Math.max(...nested) : null
}
