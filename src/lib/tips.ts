/** Set VITE_TIPS_URL to the deployed worker URL (see worker/README.md). */
export const TIPS_URL = (import.meta.env.VITE_TIPS_URL as string | undefined)?.trim() || ''

export interface Tips {
  subject: string
  /** One tip per step, same order as STEPS. */
  tips: string[]
}

/** Sends a small JPEG copy of the photo to the proxy. The API key never reaches the browser. */
export async function fetchTips(source: HTMLCanvasElement): Promise<Tips> {
  const long = 512
  const k = Math.min(1, long / Math.max(source.width, source.height))
  const small = document.createElement('canvas')
  small.width = Math.round(source.width * k)
  small.height = Math.round(source.height * k)
  small.getContext('2d')!.drawImage(source, 0, 0, small.width, small.height)
  const image = small.toDataURL('image/jpeg', 0.8).split(',')[1]

  const res = await fetch(TIPS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  })
  if (res.status === 429) throw new Error('Too many requests right now. Please try again in a minute.')
  if (!res.ok) throw new Error('Could not get tips. The guide still works without them.')
  const data = (await res.json()) as Partial<Tips>
  if (typeof data.subject !== 'string' || !Array.isArray(data.tips)) throw new Error('Unexpected response from tips service.')
  return { subject: data.subject, tips: data.tips.map(String) }
}
