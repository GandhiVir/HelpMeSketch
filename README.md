# HelpMeSketch

Upload a photo and get a layer-by-layer guide for sketching it on paper: grid, big shapes, contours, details, then shading in three tones. Includes a printable PDF with a grid scaled to your paper.

Image processing runs entirely in the browser; photos are not uploaded. The only network call is the optional AI tips button (see `worker/README.md`).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## How it works
- `src/lib/pipeline.ts` builds the layers: blurred tone masses (shapes), difference-of-Gaussians edges thinned to centre lines (contours and details), and percentile-based shading regions.
- `src/lib/render.ts` draws each step cumulatively; orange marks what is new.
- `src/lib/pdf.ts` exports one page per step with a vector grid.
- `worker/` is a small Cloudflare Worker proxying Gemini so the API key stays private.
