import type { Layers } from './pipeline'
import { colLabel, gridFor, renderStep } from './render'
import { STEPS } from './steps'

export type PaperSize = 'a4' | 'a5' | 'letter'

const PAPERS: Record<PaperSize, [number, number]> = {
  a4: [210, 297],
  a5: [148, 210],
  letter: [215.9, 279.4],
}

export const PAPER_LABELS: Record<PaperSize, string> = { a4: 'A4', a5: 'A5', letter: 'US Letter' }

const MARGIN = 12
const HEADER_H = 44
const FOOTER_H = 10

interface PageGeometry {
  pw: number
  ph: number
  /** Where the drawing sits on every page, in mm. */
  x: number
  y: number
  w: number
  h: number
}

/** The drawing rectangle is identical on every page, so the paper grid matches all steps. */
export function pageGeometry(paper: PaperSize, imgW: number, imgH: number): PageGeometry {
  const [short, long] = PAPERS[paper]
  const landscape = imgW > imgH * 1.15
  const pw = landscape ? long : short
  const ph = landscape ? short : long
  const boxW = pw - MARGIN * 2
  const boxH = ph - MARGIN - HEADER_H - FOOTER_H
  const k = Math.min(boxW / imgW, boxH / imgH)
  const w = imgW * k
  const h = imgH * k
  return { pw, ph, x: (pw - w) / 2, y: HEADER_H + (boxH - h) / 2, w, h }
}

/** Size of one grid cell on paper, for the on-screen hint. */
export function cellSizeMm(paper: PaperSize, layers: Layers, cols: number) {
  const g = gridFor(layers.w, layers.h, cols)
  const p = pageGeometry(paper, layers.w, layers.h)
  return { cols: g.cols, rows: g.rows, w: p.w / g.cols, h: p.h / g.rows, boxW: p.w, boxH: p.h }
}

export interface PdfInput {
  layers: Layers
  original: Uint8ClampedArray
  cols: number
  paper: PaperSize
  tips?: { subject: string; tips: string[] } | null
}

function stepPng(layers: Layers, original: Uint8ClampedArray, step: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = layers.w
  canvas.height = layers.h
  const ctx = canvas.getContext('2d')!
  renderStep(ctx, layers, original, { step, showReference: false, showGrid: false, cols: 0 })
  return canvas.toDataURL('image/png')
}

export async function downloadPdf(input: PdfInput): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const { layers, original, cols, paper, tips } = input
  const geo = pageGeometry(paper, layers.w, layers.h)
  const g = gridFor(layers.w, layers.h, cols)
  const doc = new jsPDF({ unit: 'mm', format: [geo.pw, geo.ph], orientation: geo.pw > geo.ph ? 'landscape' : 'portrait' })
  const textW = geo.pw - MARGIN * 2

  const drawGridLines = () => {
    doc.setDrawColor(70, 90, 130)
    doc.setLineWidth(0.15)
    const cw = geo.w / g.cols
    const ch = geo.h / g.rows
    for (let c = 0; c <= g.cols; c++) doc.line(geo.x + c * cw, geo.y, geo.x + c * cw, geo.y + geo.h)
    for (let r = 0; r <= g.rows; r++) doc.line(geo.x, geo.y + r * ch, geo.x + geo.w, geo.y + r * ch)
    doc.setFontSize(7)
    doc.setTextColor(70, 90, 130)
    for (let c = 0; c < g.cols; c++) doc.text(colLabel(c), geo.x + c * cw + cw / 2, geo.y - 1.2, { align: 'center' })
    for (let r = 0; r < g.rows; r++) doc.text(String(r + 1), geo.x - 1.5, geo.y + r * ch + ch / 2 + 1, { align: 'right' })
  }

  const header = (title: string, body: string, extra?: string) => {
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(title, MARGIN, MARGIN + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const lines = doc.splitTextToSize(body, textW) as string[]
    doc.text(lines, MARGIN, MARGIN + 12)
    if (extra) {
      doc.setTextColor(150, 60, 10)
      const y = MARGIN + 12 + lines.length * 4.4 + 1.5
      doc.text(doc.splitTextToSize(extra, textW) as string[], MARGIN, y)
    }
  }

  // Page 1: the reference photo, gridded, plus how to set up the paper.
  const cell = cellSizeMm(paper, layers, cols)
  header(
    'HelpMeSketch: reference and grid',
    `Draw a grid of ${g.cols} columns by ${g.rows} rows inside a ${cell.boxW.toFixed(0)} x ${cell.boxH.toFixed(0)} mm rectangle ` +
      `(each cell about ${cell.w.toFixed(1)} x ${cell.h.toFixed(1)} mm), or any size with the same proportions. ` +
      `Label columns A-${colLabel(g.cols - 1)} and rows 1-${g.rows}, then follow the steps on the next pages.`,
    tips?.subject ? `Looks like: ${tips.subject}` : undefined,
  )
  doc.addImage(stepPng(layers, original, 0), 'PNG', geo.x, geo.y, geo.w, geo.h, undefined, 'FAST')
  drawGridLines()

  STEPS.slice(1).forEach((s, i) => {
    const stepIdx = i + 1
    doc.addPage([geo.pw, geo.ph], geo.pw > geo.ph ? 'landscape' : 'portrait')
    const tip = tips?.tips?.[stepIdx]
    header(
      `Step ${stepIdx}: ${s.title}`,
      s.instruction,
      tip ? `Tip for this photo: ${tip}` : `Watch out: ${s.watchOut}`,
    )
    doc.addImage(stepPng(layers, original, stepIdx), 'PNG', geo.x, geo.y, geo.w, geo.h, undefined, 'FAST')
    drawGridLines()
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text('Orange = new this step. Grey = already drawn.', MARGIN, geo.ph - 6)
  })

  doc.save('helpmesketch-guide.pdf')
}
