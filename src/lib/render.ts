import type { Layers } from './pipeline'
import { STEPS } from './steps'

export interface GridSpec {
  cols: number
  rows: number
  /** Cell size in image pixels. */
  cw: number
  ch: number
}

/** Cells are as close to square as possible while tiling the image exactly. */
export function gridFor(w: number, h: number, cols: number): GridSpec {
  const rows = Math.max(1, Math.round((cols * h) / w))
  return { cols, rows, cw: w / cols, ch: h / rows }
}

export const colLabel = (i: number) => String.fromCharCode(65 + i)

const PAPER: [number, number, number] = [251, 250, 247]
const ACCENT: [number, number, number] = [194, 65, 12]
const INK: [number, number, number] = [74, 71, 66]
const MUTED: [number, number, number] = [190, 186, 178]
// Shading greys for darkest / mid / light regions.
const TONE_GREY = [92, 150, 205]

export interface RenderOptions {
  step: number
  showReference: boolean
  showGrid: boolean
  cols: number
}

function mix(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Draws one step. `original` is the colour photo (RGBA) at the same size as `layers`. */
export function renderStep(
  ctx: CanvasRenderingContext2D,
  layers: Layers,
  original: Uint8ClampedArray,
  opts: RenderOptions,
) {
  const { w, h } = layers
  const out = ctx.createImageData(w, h)
  const px = out.data
  const current = STEPS[opts.step].layer
  const step = opts.step
  const isGridStep = step === 0

  // Which tone regions are visible, deepest-revealed first.
  const toneVisible = [step >= 4, step >= 5, step >= 6]

  for (let i = 0; i < w * h; i++) {
    const p = i * 4
    let c: number[] = PAPER

    if (isGridStep) {
      c = [original[p], original[p + 1], original[p + 2]]
    } else {
      if (opts.showReference) c = mix(PAPER, [original[p], original[p + 1], original[p + 2]], 0.2)

      // Tone fills: the darkest visible region wins.
      for (let k = 0; k < 3; k++) {
        if (toneVisible[k] && layers.tones[k][i]) {
          const isCurrent = current === (`tone${k}` as const)
          const base = [TONE_GREY[k], TONE_GREY[k], TONE_GREY[k] - 4]
          c = isCurrent ? mix(base, ACCENT, 0.16) : base
          break
        }
      }

      const line = (mask: Uint8Array, key: string, quiet: number[]) => {
        if (step >= STEPS.findIndex((s) => s.layer === key) && mask[i]) {
          c = key === current ? ACCENT : quiet
        }
      }
      line(layers.blobs, 'blobs', MUTED)
      line(layers.details, 'details', INK)
      line(layers.contours, 'contours', INK)
    }

    px[p] = c[0]
    px[p + 1] = c[1]
    px[p + 2] = c[2]
    px[p + 3] = 255
  }
  ctx.putImageData(out, 0, 0)

  if (opts.showGrid) drawGrid(ctx, w, h, opts.cols, isGridStep)
}

export function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, cols: number, strong: boolean) {
  const g = gridFor(w, h, cols)
  ctx.save()
  ctx.strokeStyle = strong ? 'rgba(255,255,255,0.85)' : 'rgba(70,90,130,0.38)'
  ctx.lineWidth = Math.max(1, w / 700)
  ctx.beginPath()
  for (let c = 1; c < g.cols; c++) {
    ctx.moveTo(c * g.cw, 0)
    ctx.lineTo(c * g.cw, h)
  }
  for (let r = 1; r < g.rows; r++) {
    ctx.moveTo(0, r * g.ch)
    ctx.lineTo(w, r * g.ch)
  }
  ctx.stroke()
  if (strong) {
    // Thin dark twin so the grid stays visible on bright photos.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = Math.max(0.5, w / 1600)
    ctx.stroke()
  }

  const fs = Math.max(11, Math.round(Math.min(g.cw, g.ch) * 0.22))
  ctx.font = `600 ${fs}px system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillStyle = strong ? 'rgba(255,255,255,0.95)' : 'rgba(50,70,110,0.75)'
  ctx.shadowColor = strong ? 'rgba(0,0,0,0.7)' : 'transparent'
  ctx.shadowBlur = 3
  for (let c = 0; c < g.cols; c++) ctx.fillText(colLabel(c), c * g.cw + 4, 3)
  for (let r = 0; r < g.rows; r++) ctx.fillText(String(r + 1), 4, r * g.ch + (r === 0 ? fs + 6 : 3))
  ctx.restore()
}
