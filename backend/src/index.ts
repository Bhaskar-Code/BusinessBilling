import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { initDb } from './db/database';

import partiesRouter from './routes/parties';
import itemsRouter from './routes/items';
import transactionsRouter from './routes/transactions';
import paymentsRouter from './routes/payments';
import expensesRouter from './routes/expenses';
import reportsRouter from './routes/reports';
import settingsRouter from './routes/settings';
import { testD1Connection, isD1Configured, getD1Config } from './db/d1Client';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Vyapaar API is running', timestamp: new Date().toISOString() });
});

// Auth Login
app.post('/api/auth/login', (req: Request, res: Response) => {
  const u = (req.body.username || '').trim().toLowerCase();
  const p = (req.body.password || '').trim();
  if ((u === 'admin' || u === 'studio' || u === 'owner') && (p === 'admin' || p === 'admin123' || p === '123456' || p === 'studio123')) {
    res.json({
      success: true,
      data: {
        token: 'auth_' + Date.now(),
        user: {
          id: 'user_1',
          username: u,
          name: u === 'studio' ? 'Studio Manager' : 'Studio Owner (Admin)',
          role: 'admin',
        }
      }
    });
    return;
  }
  res.status(401).json({ success: false, error: 'Invalid username or password' });
});

// Cloudflare D1 Status
app.get('/api/d1/status', async (_req: Request, res: Response) => {
  const configured = isD1Configured();
  if (!configured) {
    res.json({
      success: true,
      data: {
        configured: false,
        status: 'Local SQLite fallback',
        message: 'Cloudflare D1 credentials not set in .env',
      },
    });
    return;
  }

  const d1Test = await testD1Connection();
  const config = getD1Config();

  res.json({
    success: true,
    data: {
      configured: true,
      connected: d1Test.connected,
      account_id: config?.accountId,
      database_id: config?.databaseId,
      table_count: d1Test.tableCount,
      latency_ms: d1Test.durationMs,
      error: d1Test.error,
    },
  });
});

// Routes
app.use('/api/parties', partiesRouter);
app.use('/api/items', itemsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);

// Serve frontend static build
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// SPA fallback for non-API routes
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// 404 handler
app.use('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Bootstrap
async function bootstrap() {
  try {
    await initDb();
    console.log('[DB] Database initialized successfully');

    app.listen(PORT, () => {
      console.log(`[SERVER] Vyapaar API running on http://localhost:${PORT}`);
      console.log(`[SERVER] Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('[FATAL] Failed to initialize database:', err);
    process.exit(1);
  }
}

bootstrap();

export default app;
