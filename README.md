# Design System Agent

This repository ships a GitHub Pages front-end plus a Vercel API that work together to answer questions about your design system.

## Architecture

- **`frontend/`** – Vite + React static site that can be deployed to GitHub Pages. It loads the local knowledge base JSON and calls the API for answers.
- **`data/knowledge/index.json`** – Generated knowledge base compiled from your Figma files. Update it with `npm run sync:figma`.
- **`tools/sync-figma.ts`** – CLI script that fetches variables, components, and styles via Figma REST APIs and rebuilds the knowledge base file.
- **`api/chat.ts`** – Serverless function meant for Vercel. It validates input, assembles a grounded prompt, and calls OpenAI (or any LLM compatible with the OpenAI SDK).

## Prerequisites

- Node.js 18+
- NPM
- Figma personal access token with _File browsing_ and _Variable reading_ scopes
- OpenAI API key (or compatible endpoint)

## Environment variables

| Location | Variable | Purpose |
| --- | --- | --- |
| root | `FIGMA_PAT` | Personal access token for the sync script. `FIGMA_PERSONAL_ACCESS_TOKEN` or `FIGMA_OAUTH_TOKEN` are also recognized. |
| root | `FIGMA_FILE_KEYS` | Comma-separated list of file keys that contain your design system tokens/components. |
| Vercel | `OPENAI_API_KEY` | API key for the model provider. |
| Vercel (optional) | `OPENAI_MODEL` | Override the model name (default `gpt-4o-mini`). |
| frontend | `VITE_AGENT_API_URL` | URL of the deployed Vercel function, e.g. `https://your-app.vercel.app/api/chat`. |
| frontend | `VITE_BASE_PATH` | Set to `/<repo-name>/` when hosting on GitHub Pages under a subpath. |

## Usage

### 1. Install dependencies

```
npm install
npm --prefix frontend install
```

### 2. Sync Figma knowledge

```
FIGMA_PAT=figd_xxx FIGMA_FILE_KEYS=abc123 npm run sync:figma
```

The script writes `data/knowledge/index.json`. Commit the file so the static site can serve it.

### 3. Run locally

```
npm run dev:frontend
```

Default dev server: http://localhost:5173. To run the API locally you can use Vercel CLI or `vercel dev`.

### 4. Deployments

- **GitHub Pages**: Configure the repo to build `frontend` with `npm --prefix frontend run build`. Publish the `frontend/dist` folder. Ensure `VITE_BASE_PATH` matches the repository slug.
- **Vercel Function**: Create a new Vercel project pointing to this repository. Set the framework to "Other", build command `npm install`, and output directory leave empty (functions only). The serverless function lives at `api/chat.ts`.

## Updating knowledge automatically

Automate the `sync-figma` script in CI (GitHub Actions, cron) to keep your knowledge base fresh. The script is idempotent and only requires the PAT plus file keys.

## Security notes

- The front-end never exposes your model key. All model requests are proxied via Vercel.
- Rotate the Figma PAT every 90 days (Figma’s current limit). Update the `FIGMA_PAT` secret in your CI and re-run the sync script.
- If you move to a different model provider, adjust `api/chat.ts` to call that SDK or HTTP endpoint.

## Next steps

- Add more parsing in `tools/sync-figma.ts` (e.g., design tokens for typography, grid, motion) as your system evolves.
- Extend the knowledge base with manual markdown entries (add new chunks to `data/knowledge/index.json`).
- Instrument analytics or logging inside `api/chat.ts` to understand common questions.
