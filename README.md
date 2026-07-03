# Board Game Inventory 🚀

A Cloudflare Pages full-stack application built with React, Vite, TailwindCSS, Hono, D1, R2, and Gemini 2.5 Flash Vision.

Staff photograph a shelf, Gemini extracts the game titles/publishers from the photo, staff review and correct the draft list, and it's committed to the inventory. Customers (or staff) can then search the inventory by title or publisher and see which shelf a game lives on.

## Architecture

- **Frontend:** React + Vite + TailwindCSS (`src/`), a single PIN-gated page with two views: Search and Admin.
- **API:** Hono running as Cloudflare Pages Functions (`functions/api/`), routed under `/api/*`.
- **Database:** Cloudflare D1 (SQLite) — two tables, `Shelves` and `Games` (see `schema.sql`).
- **Storage:** Cloudflare R2 — stores the shelf photos taken during cataloging.
- **AI:** Google Gemini 2.5 Flash (vision) — reads a shelf photo and returns a draft list of game titles/publishers for staff to confirm.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.dev.vars` file in the project root (gitignored, never commit it) with:
   ```
   APP_PIN=1234
   GEMINI_API_KEY=your-gemini-api-key
   ```
3. Run the frontend only (no API routes) with:
   ```bash
   npm run dev
   ```
   To exercise the full stack locally (API routes, D1, R2), build and run through Wrangler instead:
   ```bash
   npm run build
   npx wrangler pages dev dist
   ```
   The first time, hit `GET /api/games/init` once to create the local D1 tables (mirrors `schema.sql`).

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `APP_PIN` | Yes | Single shared PIN gating the entire app (see Authentication Model below). |
| `GEMINI_API_KEY` | Yes, for AI cataloging | Used by `/api/admin/analyze-shelf` to call the Gemini API. Without it, shelf photos still upload but skip AI extraction — staff fall back to manual entry. |
| `BGG_API_KEY`, `BGG_API_URL` | No | Reserved for a planned BoardGameGeek lookup/enrichment integration (see `docs/detection_improvement_strategies.md`). **Not currently used anywhere in the app** — safe to omit until that feature is built. |

## Authentication Model

The app is gated by a single shared PIN (`APP_PIN`), sent as either the `x-app-pin` header or a `pin` query parameter. There is **no separate admin PIN** — anyone with the PIN can search, log games manually, upload/analyze shelf photos (which costs Gemini API usage), export/import the full inventory, and wipe the database. This is a deliberate simplicity tradeoff for a small, single-location, trusted-staff tool, not a general-purpose access control system. Before deploying somewhere with a less trusted user base, consider splitting staff/admin access into separate PINs or a real auth provider.

Destructive admin actions (Wipe Inventory, Import/Restore) require typing a confirmation word in addition to the PIN, to guard against accidental clicks.

## Deploying to Production

To take this application off your localhost and deploy it live to the global Cloudflare edge, follow these 5 steps in your terminal.

### 1. Provision Cloudflare Resources
First, you need to create the production Database and Bucket within your Cloudflare account. 

Run these commands to provision them:
```bash
npx wrangler d1 create bgi-db
npx wrangler r2 bucket create bgi-photos
```

*Note: After running the D1 command, Wrangler will print out a `database_name` and a `database_id`. Open your `wrangler.toml` file and replace the `database_id = "PLACEHOLDER"` with the actual ID it gave you!*

### 2. Push the Database Schema
Now that your production database is created, you must instantiate the tables (Shelves & Games) onto the live server.
```bash
npx wrangler d1 execute bgi-db --remote --file=./schema.sql
```

### 3. Create the Pages Project
Before injecting secrets or deploying, initialize the Pages project on Cloudflare:
```bash
npx wrangler pages project create boardgameinventory --production-branch main
```

### 4. Set Production Secrets
Your `.dev.vars` file is strictly for your local server and will *never* be uploaded to Cloudflare for security reasons. You must inject your secrets into your live Cloudflare project directly using these commands:
```bash
npx wrangler pages secret put APP_PIN
npx wrangler pages secret put GEMINI_API_KEY
```
*(It will prompt you to type the actual keys in the terminal. Once you press Enter, they are securely locked into the Cloudflare environment.)*

Use a **different** `APP_PIN` in production than whatever you used locally during development — treat any PIN that was ever typed into a local `.dev.vars` file or shared during development/review as burned.

### 5. Build the Frontend
Compile your React application into raw lightning-fast Static Assets (`/dist`).
```bash
npm run build
```

### 6. Deploy 🔥
Push the final compiled frontend and your Hono backend up to Cloudflare Pages!
```bash
npx wrangler pages deploy dist
```
*(This command will print out the live URL of your newly launched web app!)*

## Backup & Restore

Two layers of protection against data loss:

1. **Cloudflare D1 Time Travel (built-in, no setup required).** D1 automatically keeps a point-in-time history of the database for 30 days. If something goes wrong, you can restore the production database to any minute in that window without needing a manual backup:
   ```bash
   npx wrangler d1 time-travel restore bgi-db --timestamp=<unix-or-iso-timestamp>
   ```
   Note this only restores the `Shelves`/`Games` tables — it doesn't touch R2, but shelf photos in R2 are never deleted by app actions anyway (see below).

2. **In-app Export/Import (Admin Dashboard).** Use **⬇️ Export Backup** to download the full inventory (all shelves and games, with their original IDs and timestamps) as a JSON file. Use **⬆️ Import / Restore** to load one back in — this is a **replace-all** operation: it deletes everything currently in the database before restoring from the file, and requires typing `RESTORE` to confirm. Good practice: export a backup before any bulk changes, and periodically for offline safekeeping.

Note that **Wipe Inventory** only clears the `Shelves`/`Games` tables in D1; it does not delete the underlying photos in the R2 bucket.

## Roadmap / Not Yet Implemented

`docs/detection_improvement_strategies.md` describes planned improvements to AI detection accuracy (image tiling, multi-pass prompting, BGG-based fuzzy matching, spreadsheet import). None of these are implemented yet — the `bgg` npm dependency, the `Games.bgg_id` column, and the `BGG_API_KEY`/`BGG_API_URL` variables exist in preparation for that work but aren't wired up to anything currently.
