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
app.use('*', async (c, next) => {
  if (c.req.path === '/api/auth/verify') {
    return next(); // skip auth for the auth endpoint itself
  }
  
  // To keep it simple, expect a pin in the Authorization header or a cookie
  // For this prototype, we'll check an 'x-app-pin' header or cookie.
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
