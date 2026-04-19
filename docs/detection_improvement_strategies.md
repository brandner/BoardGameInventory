# Strategies to Reduce Missed Games

A comprehensive list of approaches to improve AI detection accuracy when scanning board game shelves.

---

## Image Processing

### 1. Image Slicing / Tiling
Slice a full shelf photo into smaller regions (e.g., 2×2 quadrants or horizontal strips per shelf level) before sending to Gemini.

- **Why it works:** Individual game boxes become a much larger percentage of the image pixels, making text and logos easier for the model to read.
- **Impact:** 🟢 High — this is typically the single biggest accuracy improvement.
- **Complexity:** Medium — requires server-side image manipulation (e.g., Sharp or Canvas API) plus de-duplication of results across overlapping slices.

### 2. Progressive Resolution Handling
Ensure the original image is not over-compressed on the frontend before upload. Send the highest resolution the Gemini API supports.

- **Why it works:** More pixels = more readable text on small box spines.
- **Impact:** 🟡 Medium — easy win if images are currently being downscaled too aggressively.
- **Complexity:** Low — adjust frontend compression settings and validate upload pipeline.

---

## Prompt Engineering

### 3. Multi-Pass Prompting
Restructure the AI prompt to force a more methodical scan rather than a single open-ended request.

**Techniques:**
- **Count-first:** *"First, estimate how many distinct boxes you see. Then list each one."*
- **Positional scanning:** *"List games on the top shelf, then middle, then bottom."*
- **Two-pass:** First pass identifies games, second pass reviews the image for anything missed.

- **Impact:** 🟡 Medium — helps catch items the model glosses over on a single pass.
- **Complexity:** Low — prompt changes only, no code architecture changes.

---

## UI / UX Improvements

### 4. "Did We Miss Any?" Verification Flow
After AI detection completes, present the detected game list alongside the uploaded photo and provide a streamlined way to add missing games.

**Features:**
- Side-by-side view: photo + detected list
- Prominent "Add Missing Game" button
- Auto-fill the current shelf location in the manual entry form
- Quick-add flow (game name → BGG lookup → confirm → done)

- **Impact:** 🟢 High — turns silent misses into recoverable gaps; always needed as a safety net.
- **Complexity:** Low–Medium — mostly frontend UI work.

---

## External Data Integration

### 5. Fuzzy Matching via BGG API
Use the [BoardGameGeek XML API2](https://boardgamegeek.com/wiki/page/BGG_XML_API2) to resolve partial or garbled AI output to canonical game names.

**Capabilities:**
- **Name resolution:** "Ticket to Ri..." → *Ticket to Ride*
- **Hallucination detection:** If BGG returns no results, flag the entry for manual review instead of inserting it.
- **Data enrichment:** Pull player count, play time, weight, categories, box art thumbnail, and BGG ID for a richer inventory.

- **Impact:** 🟡 Medium — cleans up data quality significantly.
- **Complexity:** Medium — requires BGG API integration, fuzzy search logic, and handling BGG's XML responses + rate limits.

### 6. Spreadsheet Import (Known Inventory)
Allow uploading a CSV/Excel file of your known game collection to use as a reference list.

**Capabilities:**
- **Bulk inventory bootstrap:** Populate the entire inventory instantly without scanning.
- **Detection → Verification flip:** Instead of open-ended *"What games are here?"*, the AI task becomes *"Which of these known games can you see?"* — a dramatically easier problem.
- **Diff-based workflow:** Compare AI detections against the known list to surface likely misses as prompts rather than silent failures.

- **Impact:** 🟢 High — fundamentally changes the problem from open-ended identification to closed-set verification.
- **Complexity:** Medium — CSV/XLSX parsing, import UI, matching logic.

---

## Combined Strategy (Recommended Pipeline)

The most robust approach layers multiple strategies together:

```
┌─────────────────────────────────────────────────────┐
│  1. Import spreadsheet (one-time bootstrap)         │
│     → Populates full inventory with canonical names │
├─────────────────────────────────────────────────────┤
│  2. Upload shelf photo                              │
│     → Slice into tiles (Strategy 1)                 │
│     → Send at max resolution (Strategy 2)           │
├─────────────────────────────────────────────────────┤
│  3. AI scans each tile                              │
│     → Multi-pass prompting (Strategy 3)             │
│     → Returns raw detected names                    │
├─────────────────────────────────────────────────────┤
│  4. Post-processing                                 │
│     → BGG fuzzy match (Strategy 5)                  │
│     → Cross-reference against known inventory (6)   │
│     → De-duplicate across tiles                     │
├─────────────────────────────────────────────────────┤
│  5. Verification UI (Strategy 4)                    │
│     → Show: ✅ Matched  ⚠️ Unmatched  ❓ Missed     │
│     → User confirms / corrects / adds missing       │
└─────────────────────────────────────────────────────┘
```

> [!TIP]
> Strategies 3 (prompt tweaks) and 4 (verification UI) are the lowest-effort, highest-value starting points. Strategy 1 (image slicing) is the biggest accuracy lever but requires more backend work. Strategy 6 (spreadsheet import) is transformational if a game list is available.

---

## Open Questions

- **Spreadsheet format:** What format is available? (CSV, XLSX, Google Sheets?)
- **Spreadsheet columns:** Just game names, or also publisher/player count/etc.?
- **Spreadsheet sync:** One-time import or recurring uploads as new games are acquired?
- **Priority:** Which strategies should we implement first?
