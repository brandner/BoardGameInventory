import { Hono } from 'hono';
import { Env } from './[[route]]';

export const gameRoutes = new Hono<{ Bindings: Env }>();

// Shelf location is only included for callers presenting a valid admin PIN.
// Public search just confirms "we have it" — staff searching from the same
// page see the shelf too, once logged into Admin elsewhere in the app.
function isAdminCaller(c: { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined }; env: Env }) {
  const expectedPin = c.env.APP_PIN;
  if (!expectedPin) return true; // no PIN configured (local dev) — no boundary to enforce
  const reqPin = c.req.header('x-app-pin') || c.req.query('pin');
  return reqPin === expectedPin;
}

function stripShelfUnlessAdmin<T extends { shelf_name?: unknown }>(rows: T[], isAdmin: boolean) {
  if (isAdmin) return rows;
  return rows.map(({ shelf_name, ...rest }) => rest);
}

gameRoutes.get('/init', async (c) => {
  await c.env.DB.exec(`
    CREATE TABLE IF NOT EXISTS Shelves (id TEXT PRIMARY KEY, name TEXT NOT NULL, photo_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS Games (id TEXT PRIMARY KEY, title TEXT NOT NULL, bgg_id TEXT, publisher TEXT, shelf_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (shelf_id) REFERENCES Shelves(id) ON DELETE CASCADE);
  `);
  return c.text('INIT OK');
});

// Search for a game
gameRoutes.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q || !q.trim()) return c.json({ error: 'Missing query parameter', results: [] }, 400);

  const isAdmin = isAdminCaller(c);

  // 1. Strip punctuation (like '.' or '&') out completely.
  // 2. Strip standard English stop words (like 'and', 'the').
  const cleaned = q.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(and|or|the|of|in|a|an)\b/g, ' ');
    
  // 3. Isolate the remaining core keywords ("above", "bellow").
  const keywords = cleaned.split(/\s+/).filter(w => w.length > 1);

  if (keywords.length === 0) {
      // Fallback to literal fuzzy if all they typed was weird punctuation
      const fallback = `%${q.trim().replace(/\s+/g, '%')}%`;
      const fallbackResult = await c.env.DB.prepare(`
        SELECT g.id, g.title, g.bgg_id, g.publisher, s.name as shelf_name 
        FROM Games g JOIN Shelves s ON g.shelf_id = s.id
        WHERE g.title LIKE ? OR g.publisher LIKE ? ORDER BY g.title ASC LIMIT 50
      `).bind(fallback, fallback).all();
      return c.json({ results: stripShelfUnlessAdmin(fallbackResult.results as { shelf_name?: unknown }[], isAdmin) });
  }

  // 4. Dynamically chain SQL statements so every keyword must be present ANYWHERE.
  let sql = `
    SELECT g.id, g.title, g.bgg_id, g.publisher, s.name as shelf_name 
    FROM Games g JOIN Shelves s ON g.shelf_id = s.id
    WHERE 1=1
  `;
  const binds = [];

  for (const word of keywords) {
    sql += ` AND (g.title LIKE ? OR g.publisher LIKE ?)`;
    binds.push(`%${word}%`);
    binds.push(`%${word}%`);
  }
  
  sql += ` ORDER BY g.title ASC LIMIT 50`;

  const result = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ results: stripShelfUnlessAdmin(result.results as { shelf_name?: unknown }[], isAdmin) });
});

// Search by exact publisher
gameRoutes.get('/publisher/:publisher', async (c) => {
  const publisher = c.req.param('publisher');

  const result = await c.env.DB.prepare(`
    SELECT g.id, g.title, g.bgg_id, s.name as shelf_name
    FROM Games g
    JOIN Shelves s ON g.shelf_id = s.id
    WHERE g.publisher = ?
    ORDER BY g.title ASC
  `).bind(publisher).all();

  return c.json({ results: stripShelfUnlessAdmin(result.results as { shelf_name?: unknown }[], isAdminCaller(c)) });
});

// Provide a safe list of available shelves for the manual logging dropdown
gameRoutes.get('/shelves', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT id, name FROM Shelves ORDER BY name ASC
  `).all();
  return c.json({ shelves: result.results });
});

// Manual Log Override
gameRoutes.post('/manual-entry', async (c) => {
  const body = await c.req.json();
  const { title, shelf_name, publisher } = body;
  
  if (!title || !shelf_name) {
    return c.json({ error: 'Title and Shelf Name are required' }, 400);
  }

  const db = c.env.DB;
  
  // Find or create shelf
  let shelfId;
  const shelfResult = await db.prepare(`SELECT id FROM Shelves WHERE name = ? COLLATE NOCASE`).bind(shelf_name).first();
  if (shelfResult) {
    shelfId = shelfResult.id;
  } else {
    shelfId = crypto.randomUUID();
    await db.prepare(`INSERT INTO Shelves (id, name) VALUES (?, ?)`).bind(shelfId, shelf_name).run();
  }

  // Generate ID for game
  const gameId = crypto.randomUUID();
  
  // Insert game
  await db.prepare(`
    INSERT INTO Games (id, title, publisher, shelf_id)
    VALUES (?, ?, ?, ?)
  `).bind(gameId, title, publisher || '', shelfId).run();

  return c.json({ success: true, gameId });
});
