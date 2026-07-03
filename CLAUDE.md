# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install     # install dependencies
npm run dev     # Vite dev server — frontend only, /api routes are NOT available
npm run build   # tsc -b && vite build → outputs to dist/
npm run lint    # eslint .
npm run preview # preview the built dist/ (still no /api routes)
```

To exercise the API routes locally (D1, R2, Gemini, the PIN middleware), you must go through Wrangler, not Vite:
```bash
npm run build
npx wrangler pages dev dist
```
On a fresh local D1 instance, hit `GET /api/games/init` once to create the `Shelves`/`Games` tables (mirrors `schema.sql`).

There is no test suite/framework configured in this repo.

Local secrets live in `.dev.vars` (gitignored): `APP_PIN`, `GEMINI_API_KEY`, and unused `BGG_API_KEY`/`BGG_API_URL` (see below).

## Architecture

Cloudflare Pages app: React/Vite frontend (`src/`) + Hono API running as Pages Functions (`functions/api/`), sharing one deployment. D1 (SQLite) is the database, R2 stores shelf photos, Gemini 2.5 Flash (vision) extracts game titles from shelf photos.

### API routing (`functions/api/`)

- `[[route]].ts` is the Pages Functions catch-all entry point. It defines the shared `Env` type (`DB`, `BUCKET`, `APP_PIN`, `GEMINI_API_KEY`) that `games.ts` and `admin.ts` both import, creates the root Hono app with `basePath('/api')`, and mounts `gameRoutes` at `/api/games` and `adminRoutes` at `/api/admin`.
- The global middleware in `[[route]].ts` only gates paths starting with `/api/admin`, plus the schema-mutating `GET /api/games/init`, behind one shared PIN (`x-app-pin` header or `pin` query param, checked against `env.APP_PIN`). Everything else under `/api/games/*` (search, manual-entry, shelves listing) is intentionally public — see README's Authentication Model. There is no further split within `/api/admin/*` — anyone with the PIN can hit any admin endpoint, including the destructive ones.
- `games.ts` — public routes: fuzzy `search` (strips stopwords/punctuation, ANDs remaining keywords across title/publisher with `LIKE`), `manual-entry` (find-or-create shelf by name, `COLLATE NOCASE`), `shelves` listing, and `init` (PIN-gated schema bootstrap for local dev). `search` and `publisher/:publisher` self-check the PIN via `isAdminCaller()`/`stripShelfUnlessAdmin()` (not the global middleware, since the routes stay public either way) and strip `shelf_name` from results unless a valid PIN was presented — public callers get "we have it," authenticated callers get the shelf too.
- `admin.ts` — PIN-gated cataloging + dangerous operations: `analyze-shelf` (uploads photo to R2, calls Gemini with a strict JSON-output prompt, tolerates markdown-fenced or malformed responses), `commit-shelf` (writes the reviewed draft to D1), `photo/:key` (proxies R2 objects back out, preserving the uploaded `content-type`), `shelves`/`shelves/:id/games` (dashboard data), `reset` (wipes `Games`+`Shelves`, leaves R2 untouched), `export`/`import` (full-inventory JSON backup/restore — import is replace-all and preserves original IDs/timestamps), `export.csv` (flat CSV of Shelf/Title/Publisher/Date Added for spreadsheets).

### Data model (`schema.sql`)

Two tables: `Shelves` (id, name, photo_url, created_at) and `Games` (id, title, bgg_id, publisher, shelf_id → Shelves, created_at), `ON DELETE CASCADE`. `bgg_id` and the `bgg` npm package exist for a planned-but-unbuilt BoardGameGeek lookup integration (see `docs/detection_improvement_strategies.md`) — nothing currently populates or reads `bgg_id`.

R2 object keys for shelf photos are `shelf-<uuid>`, generated server-side in `admin.ts`, independent of the client-supplied filename.

### Frontend (`src/`)

- `App.tsx` defaults to the public Search view with no auth required. It owns the PIN (persisted in `localStorage`) but only checks it when `view === 'admin'`: if unauthenticated it renders `Auth` full-screen (with a "Back to Search" escape hatch) instead of `AdminPanel`, and `isAdminAuthenticated` is optimistically set from `!!pin` then corrected async via `/api/auth/verify`.
- `UserSearch.tsx` takes an optional `pin` prop — `App.tsx` only passes it through when `isAdminAuthenticated`, so a staff member logged into Admin sees shelf locations on the same public Search page, while a logged-out visitor doesn't.
- `AdminPanel.tsx` (PIN-gated) is a single component driving a linear stage machine: `dashboard → upload → review → success`, plus modal overlays for viewing a shelf photo or a shelf's game list. `analyze-shelf` returns a *draft* list the admin edits/removes/adds to before `commit-shelf` persists it. Destructive actions (Wipe Inventory, Import/Restore) require typing a confirmation word (`WIPE` / `RESTORE`) in a `window.prompt`, not just a click-through `confirm()`.
- `AdminPanel`'s fetches attach the PIN via the `x-app-pin` header, except the shelf-photo `<img src>`, which uses a `?pin=` query param since `<img>` tags can't set custom headers.
