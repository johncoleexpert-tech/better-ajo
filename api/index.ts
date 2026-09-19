import express from 'express';
import { apiRouter } from '../server/routes.js';

const app = express();

app.use(express.json());

// Defensive path recovery: restore original URL if Vercel rewrote to /api/index, /index, or /api
app.use((req, _res, next) => {
  if (req.url === '/api/index' || req.url === '/index' || req.url === '/api') {
    if (req.originalUrl && req.originalUrl !== req.url) {
      req.url = req.originalUrl;
    }
  }
  next();
});

// Support both /api/* and root /* rewrites on Vercel
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Root and health checks
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
