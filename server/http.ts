export function liveApisEnabled(): boolean {
  const v = (process.env.FOLDEX_DISABLE_LIVE_APIS ?? '').toLowerCase()
  return !(v === '1' || v === 'true' || v === 'yes')
}

type FetchOptions = RequestInit & { timeoutMs?: number }

export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 30_000, ...rest } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function getJson(
  url: string,
  options: { params?: Record<string, string | number>; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<unknown> {
  const { params, headers, timeoutMs = 30_000 } = options
  const target = new URL(url)
  if (params) {
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, String(v))
  }
  const response = await fetchWithTimeout(target.toString(), {
    headers: { Accept: 'application/json', ...(headers ?? {}) },
    timeoutMs,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${target}`)
  }
  return response.json()
}

export async function getText(
  url: string,
  options: { params?: Record<string, string | number>; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<string> {
  const { params, headers, timeoutMs = 30_000 } = options
  const target = new URL(url)
  if (params) {
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, String(v))
  }
  const response = await fetchWithTimeout(target.toString(), {
    headers: { ...(headers ?? {}) },
    timeoutMs,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${target}`)
  }
  return (await response.text()).trim()
}
