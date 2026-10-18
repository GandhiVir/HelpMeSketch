import { useCallback, useEffect, useRef, useState } from 'react'
import { buildLayers, type Layers } from './lib/pipeline'
import { cellSizeMm, downloadPdf, PAPER_LABELS, type PaperSize } from './lib/pdf'
import { renderStep } from './lib/render'
import { STEPS } from './lib/steps'
import { fetchTips, TIPS_URL, type Tips } from './lib/tips'

const MAX_SIDE = 900

interface Source {
  w: number
  h: number
  rgba: Uint8ClampedArray
  canvas: HTMLCanvasElement
}

async function loadSource(file: Blob): Promise<Source> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * k)
  const h = Math.round(bitmap.height * k)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return { w, h, rgba: ctx.getImageData(0, 0, w, h).data, canvas }
}

export default function App() {
  const [source, setSource] = useState<Source | null>(null)
  const [detail, setDetail] = useState(50)
  const [layers, setLayers] = useState<Layers | null>(null)
  const [step, setStep] = useState(0)
  const [cols, setCols] = useState(6)
  const [showGrid, setShowGrid] = useState(true)
  const [showReference, setShowReference] = useState(false)
  const [peek, setPeek] = useState(false)
  const [paper, setPaper] = useState<PaperSize>('a4')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [tips, setTips] = useState<Tips | null>(null)
  const [tipsState, setTipsState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [tipsError, setTipsError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const openFile = useCallback(async (file: Blob | undefined | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image. Please choose a JPG, PNG or WebP photo.')
      return
    }
    try {
      setError('')
      const s = await loadSource(file)
      setLayers(null)
      setTips(null)
      setTipsState('idle')
      setStep(0)
      setSource(s)
    } catch {
      setError('Could not read that image. Try a different file.')
    }
  }, [])

  // Paste an image straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      if (item) void openFile(item.getAsFile())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [openFile])

  // Recompute layers when the photo or detail level changes (debounced while sliding).
  useEffect(() => {
    if (!source) return
    const id = window.setTimeout(() => {
      setLayers(buildLayers(source.rgba, source.w, source.h, detail / 100))
    }, 200)
    return () => window.clearTimeout(id)
  }, [source, detail])

  // Draw the current step.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source || !layers) return
    canvas.width = layers.w
    canvas.height = layers.h
    const ctx = canvas.getContext('2d')!
    if (peek) {
      ctx.drawImage(source.canvas, 0, 0)
    } else {
      renderStep(ctx, layers, source.rgba, { step, showReference, showGrid, cols })
    }
  }, [layers, source, step, showReference, showGrid, cols, peek])

  // Arrow keys move between steps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length - 1, s + 1))
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const savePdf = async () => {
    if (!source || !layers) return
    setPdfBusy(true)
    try {
      await downloadPdf({ layers, original: source.rgba, cols, paper, tips })
    } finally {
      setPdfBusy(false)
    }
  }

  const getTips = async () => {
    if (!source) return
    setTipsState('loading')
    setTipsError('')
    try {
      setTips(await fetchTips(source.canvas))
      setTipsState('idle')
    } catch (e) {
      setTipsError(e instanceof Error ? e.message : 'Something went wrong.')
      setTipsState('error')
    }
  }

  const def = STEPS[step]
  const cell = layers ? cellSizeMm(paper, layers, cols) : null

  return (
    <div className="app">
      <header className="top">
        <h1>HelpMeSketch</h1>
        <p>Turn any photo into a step-by-step guide you can draw on paper.</p>
        {source && (
          <label className="btn ghost">
            New photo
            <input type="file" accept="image/*" hidden onChange={(e) => void openFile(e.target.files?.[0])} />
          </label>
        )}
      </header>

      {!source ? (
        <main
          className={`drop ${dragging ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void openFile(e.dataTransfer.files[0])
          }}
        >
          <h2>Drop a photo here</h2>
          <p>or paste one from your clipboard</p>
          <label className="btn primary">
            Choose a photo
            <input type="file" accept="image/*" hidden onChange={(e) => void openFile(e.target.files?.[0])} />
          </label>
          {error && <p className="error">{error}</p>}
          <ol className="how">
            <li>Upload a photo. It is processed in your browser and never uploaded.</li>
            <li>Step through grid, shapes, outlines, details and shading.</li>
            <li>Print the guide and draw along on paper.</li>
          </ol>
        </main>
      ) : (
        <main className="work">
          <section className="stage">
            <div className="canvas-wrap">
              {!layers && <div className="busy">Analysing your photo…</div>}
              <canvas ref={canvasRef} aria-label={`Step ${step + 1}: ${def.title}`} />
            </div>
            <div className="steps" role="tablist" aria-label="Steps">
              {STEPS.map((s, i) => (
                <button
                  key={s.layer}
                  role="tab"
                  aria-selected={i === step}
                  className={i === step ? 'pill active' : 'pill'}
                  onClick={() => setStep(i)}
                  title={s.title}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </section>

          <aside className="panel">
            <p className="eyebrow">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2>{def.title}</h2>
            <p>{def.instruction}</p>
            <p className="watch">
              <strong>Watch out:</strong> {def.watchOut}
            </p>
            {tips?.tips[step] && (
              <p className="ai">
                <strong>Tip for this photo:</strong> {tips.tips[step]}
              </p>
            )}
            <div className="nav">
              <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
                Back
              </button>
              <button className="btn primary" disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)}>
                Next step
              </button>
            </div>

            <hr />
            <div className="field">
              <label htmlFor="detail">
                Detail level <span>{detail < 34 ? 'Simple' : detail < 67 ? 'Balanced' : 'Detailed'}</span>
              </label>
              <input id="detail" type="range" min={0} max={100} value={detail} onChange={(e) => setDetail(+e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cols">
                Grid columns <span>{cols}</span>
              </label>
              <input id="cols" type="range" min={4} max={12} value={cols} onChange={(e) => setCols(+e.target.value)} />
            </div>
            <div className="checks">
              <label>
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Show grid
              </label>
              <label>
                <input type="checkbox" checked={showReference} onChange={(e) => setShowReference(e.target.checked)} /> Faint photo behind
              </label>
            </div>
            <button
              className="btn"
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
            >
              Hold to see original photo
            </button>

            <hr />
            <div className="field">
              <label htmlFor="paper">Paper</label>
              <select id="paper" value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)}>
                {Object.entries(PAPER_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {cell && (
              <p className="hint">
                Draw {cell.cols} × {cell.rows} squares of about {cell.w.toFixed(0)} × {cell.h.toFixed(0)} mm on your paper.
              </p>
            )}
            <button className="btn primary wide" disabled={!layers || pdfBusy} onClick={() => void savePdf()}>
              {pdfBusy ? 'Making PDF…' : 'Download printable PDF'}
            </button>

            {TIPS_URL && (
              <>
                <hr />
                <button className="btn wide" disabled={tipsState === 'loading'} onClick={() => void getTips()}>
                  {tipsState === 'loading' ? 'Writing tips…' : tips ? 'Refresh coaching tips' : 'Add coaching tips (AI)'}
                </button>
                {tips && <p className="hint">Looks like: {tips.subject}</p>}
                {tipsState === 'error' && <p className="error">{tipsError}</p>}
                <p className="hint small">
                  Sends a small copy of your photo to Google Gemini to write tips. Google may use free-tier inputs to improve its products.
                  Everything else stays on your device.
                </p>
              </>
            )}
          </aside>
        </main>
      )}
    </div>
  )
}
