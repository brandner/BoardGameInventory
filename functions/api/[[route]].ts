import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  APP_PIN: string;
  GEMINI_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>().basePath('/api')

// --- Middleware: Verify PIN ---
// Search/logging (/api/games/*) is public — customers use it without a PIN.
// Admin operations (/api/admin/*) and the schema-mutating /api/games/init stay PIN-gated.
app.use('*', async (c, next) => {
  const path = c.req.path;
  const requiresPin = path.startsWith('/api/admin') || path === '/api/games/init';
  if (!requiresPin) {
    return next();
  }

  const reqPin = c.req.header('x-app-pin') || c.req.query('pin');
  const expectedPin = c.env.APP_PIN;

  // If no PIN is configured, maybe allow? For security, let's require it unless it's missing in env (local dev)
  if (expectedPin && reqPin !== expectedPin) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

// --- Auth Endpoints ---
app.post('/auth/verify', async (c) => {
  const body = await c.req.json();
  const valid = body.pin === c.env.APP_PIN;
  if (!valid) {
    return c.json({ success: false, error: 'Invalid PIN' }, 401);
  }
  return c.json({ success: true });
});

// --- User Endpoints ---
import { gameRoutes } from './games';
app.route('/games', gameRoutes);

// --- Admin Endpoints ---
import { adminRoutes } from './admin';
app.route('/admin', adminRoutes);

export const onRequest = handle(app);
