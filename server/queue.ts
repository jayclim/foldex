import { Client, Receiver } from '@upstash/qstash'

export type Stage =
  | 'annotate'
  | 'similar'
  | 'structure-unknown'
  | 'structure-wildtype'
  | 'structure-similar'
  | 'report'

export const STAGE_ORDER: Stage[] = [
  'annotate',
  'similar',
  'structure-unknown',
  'structure-wildtype',
  'structure-similar',
  'report',
]

function publicUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  return url.replace(/\/$/, '')
}

export async function enqueueStage(jobId: string, stage: Stage): Promise<void> {
  // In dev (no QStash creds), run the next stage in-process so the pipeline can
  // complete end-to-end on a local machine without needing QStash to dial back.
  if (!process.env.QSTASH_TOKEN) {
    void (async () => {
      try {
        const { runStage } = await import('./pipeline')
        await runStage(jobId, stage)
      } catch (err) {
        console.error(`Local stage ${stage} failed:`, err)
      }
    })()
    return
  }

  const client = new Client({ token: process.env.QSTASH_TOKEN })
  await client.publishJSON({
    url: `${publicUrl()}/api/worker/${stage}`,
    body: { job_id: jobId },
  })
}

export function nextStage(current: Stage): Stage | null {
  const idx = STAGE_ORDER.indexOf(current)
  if (idx < 0 || idx === STAGE_ORDER.length - 1) return null
  return STAGE_ORDER[idx + 1]
}

let receiver: Receiver | null = null

export function getReceiver(): Receiver | null {
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    return null
  }
  if (!receiver) {
    receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    })
  }
  return receiver
}

export async function verifyQStashSignature(req: Request, body: string): Promise<boolean> {
  // Allow local dev shortcut.
  if (req.headers.get('x-foldex-dev') === '1' && !process.env.QSTASH_TOKEN) return true
  const r = getReceiver()
  if (!r) return false
  const signature = req.headers.get('upstash-signature')
  if (!signature) return false
  try {
    return await r.verify({ signature, body })
  } catch {
    return false
  }
}
