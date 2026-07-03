import { Hono } from 'hono';
import { Env } from './[[route]]';
import { Buffer } from 'node:buffer';

export const adminRoutes = new Hono<{ Bindings: Env }>();

// Step 1: Analyze Photo
adminRoutes.post('/analyze-shelf', async (c) => {
  const body = await c.req.formData();
  const file = body.get('photo') as File;
  const aiHints = (body.get('ai_hints') as string) || '';

  if (!file) {
    return c.json({ error: 'Photo required' }, 400);
  }

  const fileKey = `shelf-${crypto.randomUUID()}`;
  const arrayBuffer = await file.arrayBuffer();

  // 1. Upload to R2 Bucket
  await c.env.BUCKET.put(fileKey, arrayBuffer, {
    httpMetadata: { contentType: file.type }
  });

  const photoUrl = `/api/admin/photo/${fileKey}`;

  // 2. Call Gemini API to extract game titles
  const GEMINI_API_KEY = c.env.GEMINI_API_KEY;
  let draftGames: { title: string; publisher?: string; id?: string }[] = [];
  let totalBoxes = 0;
  let serverWarning = '';

  if (GEMINI_API_KEY) {
    try {
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      const promptText = `Count the total number of physical board game boxes visible in this image. Then, attempt to extract the titles from as many of them as possible. The output should be strictly a JSON object formatted exactly like this: { "total_boxes": number, "games": [ {"title": "string", "publisher": "string"} ] } DO NOT format the JSON with markdown backticks. ${aiHints ? `\nAdditional Context/Hints: ${aiHints}` : ''}`;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: file.type, data: base64Data } }] }],
          generationConfig: { response_mime_type: 'application/json' }
        })
      });

      if (response.ok) {
        const data: any = await response.json();
        let geminiOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (geminiOutput) {
          try {
            // Strip potential markdown code blocks
            geminiOutput = geminiOutput.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(geminiOutput);
            
            draftGames = (parsed.games || []).map((g: any) => ({ ...g, id: crypto.randomUUID() }));
            totalBoxes = parsed.total_boxes || draftGames.length;
            
            if (draftGames.length === 0) {
              serverWarning = "Gemini returned zero games. Try taking a closer photo or adding hints.";
            }
          } catch (err) {
            console.error('Failed to parse Gemini JSON output', err, geminiOutput);
            serverWarning = "Failed to parse the data returned by Gemini as JSON. It might have gotten confused.";
          }
        } else {
           serverWarning = "Gemini processed the image but returned no text.";
        }
      } else {
        const errorText = await response.text();
        console.error('Gemini API Error:', errorText);
        serverWarning = `Gemini API Error: ${response.status} ${response.statusText}`;
      }
    } catch (e: any) {
      console.error('Error contacting Gemini:', e);
      serverWarning = `Internal/Network error: ${e.message || String(e)}`;
    }
  } else {
    serverWarning = "GEMINI_API_KEY is not configured on the server.";
  }

  return c.json({ success: true, photoUrl, draftGames, totalBoxes, warning: serverWarning });
});

// Step 2: Commit Shelf Data
adminRoutes.post('/commit-shelf', async (c) => {
  const body = await c.req.json();
  const { shelfName, photoUrl, games } = body;

  if (!shelfName || !games || !Array.isArray(games)) {
    return c.json({ error: 'shelfName and games array required' }, 400);
  }

  const db = c.env.DB;
  
  // Find or create shelf
  let shelfId;
  const shelfResult = await db.prepare(`SELECT id FROM Shelves WHERE name = ? COLLATE NOCASE`).bind(shelfName).first();
  if (shelfResult) {
    shelfId = shelfResult.id;
    await db.prepare(`UPDATE Shelves SET photo_url = ? WHERE id = ?`).bind(photoUrl, shelfId).run();
  } else {
    shelfId = crypto.randomUUID();
    await db.prepare(`INSERT INTO Shelves (id, name, photo_url) VALUES (?, ?, ?)`).bind(shelfId, shelfName, photoUrl).run();
  }

  // Save Games
  if (games.length > 0) {
    const stmt = db.prepare(`INSERT INTO Games (id, title, publisher, shelf_id) VALUES (?, ?, ?, ?)`);
    const batch = games.map((g: any) => stmt.bind(crypto.randomUUID(), g.title || 'Unknown', g.publisher || '', shelfId));
    await db.batch(batch);
  }

  return c.json({ success: true, count: games.length });
});

// Photo Proxy Endpoint
adminRoutes.get('/photo/:key', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.BUCKET.get(key);
  if (!object) return c.json({ error: 'Photo not found' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  return new Response(object.body as ReadableStream, { headers });
});

// Get Dashboard Overview
adminRoutes.get('/shelves', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT s.id, s.name, s.photo_url, s.created_at, COUNT(g.id) as game_count
    FROM Shelves s
    LEFT JOIN Games g ON s.id = g.shelf_id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all();
  return c.json({ shelves: result.results });
});

// Get Games for a specific shelf
adminRoutes.get('/shelves/:id/games', async (c) => {
  const shelfId = c.req.param('id');
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT id, title, publisher, created_at 
    FROM Games 
    WHERE shelf_id = ? 
    ORDER BY title ASC
  `).bind(shelfId).all();
  return c.json({ games: result.results });
});

// Wipe Inventory (Danger)
adminRoutes.post('/reset', async (c) => {
  const db = c.env.DB;
  await db.exec(`
    DELETE FROM Games;
    DELETE FROM Shelves;
  `);
  return c.json({ success: true });
});

// Export full inventory as a JSON backup
adminRoutes.get('/export', async (c) => {
  const db = c.env.DB;
  const shelvesResult = await db.prepare(`SELECT id, name, photo_url, created_at FROM Shelves ORDER BY created_at ASC`).all();
  const gamesResult = await db.prepare(`SELECT id, title, publisher, bgg_id, shelf_id, created_at FROM Games ORDER BY created_at ASC`).all();

  const gamesByShelf = new Map<string, unknown[]>();
  for (const g of gamesResult.results as Record<string, unknown>[]) {
    const list = gamesByShelf.get(g.shelf_id as string) || [];
    list.push({ id: g.id, title: g.title, publisher: g.publisher, bgg_id: g.bgg_id, created_at: g.created_at });
    gamesByShelf.set(g.shelf_id as string, list);
  }

  const shelves = (shelvesResult.results as Record<string, unknown>[]).map(s => ({
    id: s.id, name: s.name, photo_url: s.photo_url, created_at: s.created_at,
    games: gamesByShelf.get(s.id as string) || []
  }));

  return c.json({ exportedAt: new Date().toISOString(), shelves });
});

// Import a JSON backup, replacing the entire current inventory
adminRoutes.post('/import', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.shelves)) {
    return c.json({ error: 'Invalid backup file: missing shelves array' }, 400);
  }

  for (const shelf of body.shelves) {
    if (typeof shelf.id !== 'string' || typeof shelf.name !== 'string' || !Array.isArray(shelf.games)) {
      return c.json({ error: 'Invalid backup file: malformed shelf entry' }, 400);
    }
    for (const game of shelf.games) {
      if (typeof game.id !== 'string' || typeof game.title !== 'string') {
        return c.json({ error: 'Invalid backup file: malformed game entry' }, 400);
      }
    }
  }

  const db = c.env.DB;

  // Replace-all restore: wipe existing inventory before loading the backup
  await db.exec(`DELETE FROM Games; DELETE FROM Shelves;`);

  const shelfStmt = db.prepare(`INSERT INTO Shelves (id, name, photo_url, created_at) VALUES (?, ?, ?, ?)`);
  const gameStmt = db.prepare(`INSERT INTO Games (id, title, publisher, bgg_id, shelf_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`);

  const statements = [];
  let gameCount = 0;
  for (const shelf of body.shelves) {
    statements.push(shelfStmt.bind(shelf.id, shelf.name, shelf.photo_url || null, shelf.created_at || new Date().toISOString()));
    for (const game of shelf.games) {
      statements.push(gameStmt.bind(game.id, game.title, game.publisher || '', game.bgg_id || null, shelf.id, game.created_at || new Date().toISOString()));
      gameCount++;
    }
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return c.json({ success: true, shelfCount: body.shelves.length, gameCount });
});
