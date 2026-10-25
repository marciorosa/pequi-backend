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
const PORT = Number(process.env.PORT);

// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim())
  : [];

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

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
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
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

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
        message: 'Request timeout - operation took too long',
        error: 'Gateway Timeout'
      });
    }
  });

  res.setTimeout(55000, () => {
    if (!res.headersSent) {
      res.status(504).json({
        message: 'Response timeout - operation took too long',
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
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 2,
  retryWrites: true,
  retryReads: true,
}).catch(() => {});

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to AIForLawyers API' });
});

app.get('/health', (req: Request, res: Response) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  res.json({
    status: 'healthy',
    database: {
      status: dbStates[dbStatus] || 'unknown',
      connected: dbStatus === 1
    },
    timestamp: new Date().toISOString()
  });
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

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/webhooks', webhookRoutes);

/**
 * Global Error Handling Middleware
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  let statusCode = 500;
  let message = 'Something went wrong!';
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
    message = 'Data validation failed';
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
  res.status(404).json({ message: 'Route not found' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {});

export default app;
