# Tips proxy (Cloudflare Worker)

Keeps your Gemini API key off the browser. The site works without it; this only powers the optional "Add coaching tips" button.

1. Get a free key at https://aistudio.google.com/apikey (no credit card).
2. From this folder:
   ```bash
   npx wrangler login
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler deploy
   ```
3. Edit `ALLOWED_ORIGINS` in `wrangler.toml` to include your deployed site's origin (keep `http://localhost:5173` for dev), then redeploy.
4. In the project root create `.env.local`:
   ```
   VITE_TIPS_URL=https://helpmesketch-tips.<your-subdomain>.workers.dev
   ```
   Restart `npm run dev`. The AI button appears once this is set.

Local testing: `npx wrangler dev` (put `GEMINI_API_KEY=...` in `worker/.dev.vars`), then `VITE_TIPS_URL=http://localhost:8787`.

Safeguards: origin allow-list, 400 KB body cap, 8 requests/minute/IP (best effort), 25 s upstream timeout.
