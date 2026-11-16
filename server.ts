import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { fetchAndCacheKarachiDailyData } from './server/aladhan.ts';
import { createApiApp } from './server/app.ts';
import { getDb } from './server/db.ts';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = createApiApp();

  // Ensure DB is initialized on startup and warm Karachi AlAdhan cache
  const db = getDb();
  fetchAndCacheKarachiDailyData(db, false).catch(() => {});

  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Masjid-e-Bilal Prayer Timetable server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
