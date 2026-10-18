// Small, dependency-free image-processing helpers. All images are single-channel
// Float32Array (values 0..1) or Uint8Array masks (0/1), stored row-major.

/** Rec. 601 luminance from RGBA bytes. */
export function toGray(rgba: Uint8ClampedArray, n: number): Float32Array {
  const g = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const p = i * 4
    g[i] = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255
  }
  return g
}

/** Values at the given quantiles (0..1), estimated from a histogram. */
export function percentiles(src: Float32Array, qs: number[]): number[] {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < src.length; i++) {
    const v = src[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min || 1
  const BINS = 2048
  const hist = new Uint32Array(BINS)
  for (let i = 0; i < src.length; i++) {
    hist[Math.min(BINS - 1, Math.floor(((src[i] - min) / range) * BINS))]++
  }
  return qs.map((q) => {
    const target = q * src.length
    let acc = 0
    for (let b = 0; b < BINS; b++) {
      acc += hist[b]
      if (acc >= target) return min + ((b + 1) / BINS) * range
    }
    return max
  })
}

/** Stretch the 1st..99th percentile to 0..1 so dull photos still separate into tones. */
export function autoContrast(src: Float32Array): Float32Array {
  const [lo, hi] = percentiles(src, [0.01, 0.99])
  const span = Math.max(hi - lo, 0.05)
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) {
    out[i] = Math.min(1, Math.max(0, (src[i] - lo) / span))
  }
  return out
}

function boxLine(src: Float32Array, dst: Float32Array, off: number, st: number, len: number, r: number) {
  const inv = 1 / (2 * r + 1)
  const first = src[off]
  const last = src[off + (len - 1) * st]
  let val = (r + 1) * first
  for (let j = 0; j < r; j++) val += src[off + j * st]
  for (let j = 0; j <= r; j++) {
    val += src[off + (j + r) * st] - first
    dst[off + j * st] = val * inv
  }
  for (let j = r + 1; j < len - r; j++) {
    val += src[off + (j + r) * st] - src[off + (j - r - 1) * st]
    dst[off + j * st] = val * inv
  }
  for (let j = len - r; j < len; j++) {
    val += last - src[off + (j - r - 1) * st]
    dst[off + j * st] = val * inv
  }
}

function boxBlur(src: Float32Array, tmp: Float32Array, w: number, h: number, r: number) {
  const rx = Math.max(0, Math.min(r, Math.floor((w - 1) / 2)))
  const ry = Math.max(0, Math.min(r, Math.floor((h - 1) / 2)))
  if (rx > 0) for (let y = 0; y < h; y++) boxLine(src, tmp, y * w, 1, w, rx)
  else tmp.set(src)
  if (ry > 0) for (let x = 0; x < w; x++) boxLine(tmp, src, x, w, h, ry)
  else src.set(tmp)
}

/** Gaussian blur approximated by three box blurs: cost does not grow with sigma. */
export function gaussBlur(input: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const out = new Float32Array(input)
  if (sigma < 0.3) return out
  const tmp = new Float32Array(input.length)
  const n = 3
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal)
  if (wl % 2 === 0) wl--
  const wu = wl + 2
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4))
  for (let i = 0; i < n; i++) boxBlur(out, tmp, w, h, ((i < m ? wl : wu) - 1) / 2)
  return out
}

/** Removes connected foreground components smaller than `minSize` pixels (in place). */
export function removeSmall(mask: Uint8Array, w: number, h: number, minSize: number): void {
  const n = w * h
  const seen = new Uint8Array(n)
  const queue = new Int32Array(n)
  for (let s = 0; s < n; s++) {
    if (!mask[s] || seen[s]) continue
    let head = 0
    let tail = 0
    queue[tail++] = s
    seen[s] = 1
    while (head < tail) {
      const p = queue[head++]
      const x = p % w
      const y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const q = yy * w + xx
          if (mask[q] && !seen[q]) {
            seen[q] = 1
            queue[tail++] = q
          }
        }
      }
    }
    if (tail < minSize) for (let i = 0; i < tail; i++) mask[queue[i]] = 0
  }
}

/** Drops specks and fills pinholes so shaded regions are clean shapes. */
export function cleanRegion(mask: Uint8Array, w: number, h: number, minArea: number): void {
  removeSmall(mask, w, h, minArea)
  const inv = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1
  removeSmall(inv, w, h, minArea)
  for (let i = 0; i < mask.length; i++) mask[i] = inv[i] ? 0 : 1
}

/** Grows foreground by `r` pixels (square structuring element). */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return new Uint8Array(mask)
  const tmp = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = mask[y * w + k]
      tmp[y * w + x] = v
    }
  }
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = tmp[k * w + x]
      out[y * w + x] = v
    }
  }
  return out
}

/** Zhang-Suen thinning: reduces thick bands to one-pixel centre lines. */
export function thin(mask: Uint8Array, w: number, h: number): Uint8Array {
  const m = new Uint8Array(mask)
  const doomed: number[] = []
  for (let iter = 0; iter < 24; iter++) {
    let changed = false
    for (let pass = 0; pass < 2; pass++) {
      doomed.length = 0
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x
          if (!m[i]) continue
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1]
          const p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1]
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (b < 2 || b > 6) continue
          const a =
            (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
            (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0)
          if (a !== 1) continue
          if (pass === 0 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) doomed.push(i)
        }
      }
      for (const i of doomed) m[i] = 0
      if (doomed.length) changed = true
    }
    if (!changed) break
  }
  return m
}
