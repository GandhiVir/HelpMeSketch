import { autoContrast, cleanRegion, dilate, gaussBlur, percentiles, removeSmall, thin, toGray } from './imageOps'

/** Everything the renderer needs, computed once per image + detail level. */
export interface Layers {
  w: number
  h: number
  /** Rough outlines where light/medium/dark masses meet. */
  blobs: Uint8Array
  /** Main edges of objects. */
  contours: Uint8Array
  /** Finer edges not already in `contours`. */
  details: Uint8Array
  /** Nested shading regions: tones[0] darkest only, tones[2] = everything except lightest. */
  tones: [Uint8Array, Uint8Array, Uint8Array]
}

/** Thin dark features: difference of Gaussians, keeping the strongest `fraction` of pixels. */
function lineMask(gray: Float32Array, w: number, h: number, sigma: number, fraction: number): Uint8Array {
  const a = gaussBlur(gray, w, h, sigma)
  const b = gaussBlur(gray, w, h, sigma * 1.6)
  const d = new Float32Array(gray.length)
  for (let i = 0; i < d.length; i++) d[i] = a[i] - b[i]
  // Percentile threshold adapts to every photo; the cap stops flat images turning into noise.
  const [t] = percentiles(d, [fraction])
  const limit = Math.min(t, -0.006)
  const mask = new Uint8Array(d.length)
  for (let i = 0; i < d.length; i++) mask[i] = d[i] < limit ? 1 : 0
  return mask
}

function blobOutlines(gray: Float32Array, w: number, h: number, scale: number): Uint8Array {
  const long = Math.max(w, h)
  const soft = gaussBlur(gray, w, h, long * 0.03)
  const [t1, t2] = percentiles(soft, [0.33, 0.66])
  const label = new Uint8Array(soft.length)
  for (let i = 0; i < soft.length; i++) label[i] = soft[i] < t1 ? 0 : soft[i] < t2 ? 1 : 2
  const edge = new Uint8Array(soft.length)
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x
      if (label[i] !== label[i + 1] || label[i] !== label[i + w]) edge[i] = 1
    }
  }
  const thick = dilate(edge, w, h, 1)
  removeSmall(thick, w, h, Math.round(120 * scale * scale))
  return thick
}

function toneRegions(gray: Float32Array, w: number, h: number, scale: number): Layers['tones'] {
  const long = Math.max(w, h)
  const soft = gaussBlur(gray, w, h, long * 0.006)
  const cuts = percentiles(soft, [0.2, 0.45, 0.7])
  const minArea = Math.round(220 * scale * scale)
  const regions = cuts.map((cut) => {
    const raw = new Float32Array(soft.length)
    for (let i = 0; i < raw.length; i++) raw[i] = soft[i] <= cut ? 1 : 0
    // Blur-then-threshold rounds off jagged edges into pencil-friendly shapes.
    const smooth = gaussBlur(raw, w, h, long * 0.005)
    const mask = new Uint8Array(raw.length)
    for (let i = 0; i < mask.length; i++) mask[i] = smooth[i] > 0.5 ? 1 : 0
    cleanRegion(mask, w, h, minArea)
    return mask
  })
  // Guarantee nesting so each step only ever adds area.
  for (let k = 1; k < regions.length; k++) {
    for (let i = 0; i < regions[k].length; i++) if (regions[k - 1][i]) regions[k][i] = 1
  }
  return regions as Layers['tones']
}

/** `detail` is 0 (simple) to 1 (detailed). */
export function buildLayers(rgba: Uint8ClampedArray, w: number, h: number, detail: number): Layers {
  const gray = autoContrast(toGray(rgba, w * h))
  const long = Math.max(w, h)
  const scale = long / 900

  const blobs = blobOutlines(gray, w, h, scale)

  // Threshold thick bands, then thin them to centre lines so they read like pen strokes.
  const strokes = (mask: Uint8Array, bandMin: number, lineMin: number) => {
    removeSmall(mask, w, h, Math.round(bandMin * scale * scale))
    const skeleton = thin(mask, w, h)
    removeSmall(skeleton, w, h, Math.round(lineMin * scale))
    return dilate(skeleton, w, h, 1)
  }

  const contours = strokes(lineMask(gray, w, h, long * 0.006, 0.045 + 0.03 * detail), 200 - 100 * detail, 40 - 15 * detail)

  const fine = lineMask(gray, w, h, long * 0.0018, 0.05 + 0.1 * detail)
  const covered = dilate(contours, w, h, 2)
  for (let i = 0; i < fine.length; i++) if (covered[i]) fine[i] = 0
  const details = strokes(fine, 60 - 35 * detail, 22 - 10 * detail)

  return { w, h, blobs, contours, details, tones: toneRegions(gray, w, h, scale) }
}
