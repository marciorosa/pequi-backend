'use strict';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { AppError } from './utils/errors';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Surface startup/runtime failures in the hosting logs instead of dying silently
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
});

// CORS configuration
// Production domains are always allowed, plus anything listed in FRONTEND_URL (comma-separated)
const DEFAULT_ALLOWED_ORIGINS = ['https://pequi.me', 'https://www.pequi.me'];
const allowedOrigins = Array.from(new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim()).filter(Boolean)
    : []),
]));

/**
 * CORS options configuration
 */
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = origin.replace(/\/$/, '');
    const isAllowed = allowedOrigins.some(allowed => 
      allowed.replace(/\/$/, '') === normalizedOrigin
    );

    // Not allowed: answer without CORS headers instead of throwing (a thrown error turned the preflight into a 500)
    callback(null, isAllowed);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Middleware
app.use(cors(corsOptions));

// Special handling for Stripe webhooks - must come before express.json()
app.use(['/api/stripe/webhook', '/stripe/webhook'], express.raw({ type: 'application/json' }));

// Regular middleware for other routes
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

/**
 * Request timeout middleware (55 seconds)
 */
const timeoutMiddleware = (req: Request, res: Response, next: NextFunction) => {
  req.setTimeout(55000, () => {
    if (!res.headersSent) {
      res.status(504).json({
        message: 'Tempo limite da requisição esgotado - a operação demorou demais',
        error: 'Gateway Timeout'
      });
    }
  });

  res.setTimeout(55000, () => {
    if (!res.headersSent) {
      res.status(504).json({
        message: 'Tempo limite da resposta esgotado - a operação demorou demais',
        error: 'Gateway Timeout'
      });
    }
  });

  next();
};

app.use(timeoutMiddleware);

// Handle OPTIONS method for all routes
app.options('*', cors(corsOptions));

// Connect to MongoDB with optimized settings
const MONGO_URI = process.env.MONGO_URI as string;
let lastDbError: string | null = null;

/**
 * Connects to MongoDB and keeps retrying every 15s if the first attempt fails
 * (mongoose does not retry a failed initial connection on its own).
 */
const connectToMongo = (): void => {
  if (!MONGO_URI) {
    lastDbError = 'MONGO_URI não definida';
    console.error('[startup] MONGO_URI não definida: configure a variável de ambiente no painel da hospedagem.');
    return;
  }

  mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2,
    retryWrites: true,
    retryReads: true,
  }).then(() => {
    lastDbError = null;
    console.log('[startup] MongoDB conectado');
  }).catch((err) => {
    // Never expose credentials that could appear inside a connection string
    lastDbError = String(err?.message || err).replace(/mongodb(\+srv)?:\/\/[^@\s]*@/g, 'mongodb://***@');
    console.error('[startup] Falha ao conectar no MongoDB (nova tentativa em 15s):', lastDbError);
    setTimeout(connectToMongo, 15000);
  });
};

connectToMongo();

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Bem-vindo à API do Pequi' });
});

app.get('/health', (req: Request, res: Response) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  res.json({
    status: 'healthy',
    database: {
      status: dbStates[dbStatus] || 'unknown',
      connected: dbStatus === 1,
      lastError: dbStatus === 1 ? null : lastDbError
    },
    // Only reports whether each variable is set (true/false), never its value
    config: ['MONGO_URI', 'JWT_SECRET', 'GEMINI_API_KEY', 'FRONTEND_URL', 'STRIPE_SECRET_KEY', 'EMAIL_USER', 'AWS_S3_BUCKET_NAME']
      .reduce((acc, key) => { acc[key] = Boolean(process.env[key]); return acc; }, {} as Record<string, boolean>),
    node: process.version,
    timestamp: new Date().toISOString()
  });
});

// Diagnóstico da IA: testa a chave e o modelo do Gemini com uma chamada mínima
app.get('/health/ai', async (req: Request, res: Response) => {
  const { checkGemini } = await import('./services/gemini.service');
  const result = await checkGemini();
  res.status(result.ok ? 200 : 503).json({ ...result, timestamp: new Date().toISOString() });
});

// Import routes
import authRoutes from './routes/auth.routes';
import aiRoutes from './routes/ai.routes';
import chatRoutes from './routes/chat.routes';
import documentRoutes from './routes/document.routes';
import notificationRoutes from './routes/notification.routes';
import stripeRoutes from './routes/stripe.routes';
import contactRoutes from './routes/contact.routes';
import vaultRoutes from './routes/vault.routes';
import workflowRoutes from './routes/workflow.routes';
import webhookRoutes from './routes/webhook.routes';

// Register routes (served under /api and also without the prefix, so the
// frontend works whether NEXT_PUBLIC_API_URL ends in /api or not)
const routes: Array<[string, express.Router]> = [
  ['/auth', authRoutes],
  ['/ai', aiRoutes],
  ['/chats', chatRoutes],
  ['/documents', documentRoutes],
  ['/notifications', notificationRoutes],
  ['/stripe', stripeRoutes],
  ['/contact', contactRoutes],
  ['/vault', vaultRoutes],
  ['/workflows', workflowRoutes],
  ['/webhooks', webhookRoutes],
];
for (const [path, router] of routes) {
  app.use([`/api${path}`, path], router);
}

/**
 * Global Error Handling Middleware
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // Log every error so the real cause shows up in the hosting logs
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err?.stack || err);

  let statusCode = 500;
  let message = 'Algo deu errado!';
  let details = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    if (process.env.NODE_ENV === 'development' && (err as any).errors) {
      details = (err as any).errors;
    }
  } else if (err.name === 'ValidationError') {
    // Handle Mongoose validation errors
    statusCode = 400;
    message = 'Falha na validação dos dados';
    details = err.errors;
  }

  res.status(statusCode).json({
    status: 'error',
    message,
    details: details || (process.env.NODE_ENV === 'development' ? err.message : undefined)
  });
});

// Handle 404
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[startup] API do Pequi rodando na porta ${PORT}. Origens liberadas: ${allowedOrigins.join(', ')}`);
});

export default app;
