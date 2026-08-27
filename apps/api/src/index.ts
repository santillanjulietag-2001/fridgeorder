import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { connectDb } from './db.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { needsRouter } from './routes/needs.js';
import { tripsRouter } from './routes/trips.js';
import { ingestRouter } from './routes/ingest.js';
import { pantryRouter } from './routes/pantry.js';
import { mealsRouter } from './routes/meals.js';
import { householdsRouter } from './routes/households.js';

async function main() {
  await connectDb();

  const app = express();
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (origin === config.webOrigin) return cb(null, true);
        if (origin.startsWith('chrome-extension://')) return cb(null, true);
        return cb(null, true); // local/dev friendly
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '8mb' }));
  app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'FridgeOrder API' }));

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/needs', needsRouter);
  app.use('/api/trips', tripsRouter);
  app.use('/api/ingest', ingestRouter);
  app.use('/api/pantry', pantryRouter);
  app.use('/api/meals', mealsRouter);
  app.use('/api/households', householdsRouter);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (err instanceof SyntaxError) {
      return res.status(400).json({ error: 'JSON inválido' });
    }
    res.status(500).json({ error: err.message || 'Error interno' });
  });

  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
