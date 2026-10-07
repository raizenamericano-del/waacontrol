import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { prisma } from './services/prisma.js';
import { ensureStorageDirectories } from './utils/media.js';
import { apiRouter } from './routes/index.js';
import { authRouter } from './routes/auth.routes.js';
import { requireAuth } from './middleware/auth.js';
import { originGuard } from './middleware/origin-guard.js';
import { errorHandler } from './middleware/error-handler.js';
import { attachSocket } from './socket/index.js';
import { sessionManager } from './services/baileys-manager.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);

const allowedOrigins = new Set(env.CORS_ORIGINS);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  strictTransportSecurity: env.NODE_ENV === 'production' ? undefined : false,
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) callback(null, true);
    else callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(originGuard);
app.use(pinoHttp({
  logger,
  serializers: { res: (response) => ({ statusCode: response.statusCode }) },
  autoLogging: { ignore: (req) => req.url === '/health' }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'wa-controller-api', time: new Date().toISOString() }));
app.use('/api/auth', authRouter);
app.use('/api', requireAuth, apiRouter);
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' } }));
app.use(errorHandler);

const server = http.createServer(app);
const socketServer = attachSocket(server);

async function start(): Promise<void> {
  process.umask(0o077);
  await ensureStorageDirectories();
  await prisma.$connect();
  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV, dbProvider: env.DB_PROVIDER }, 'Backend berjalan');
    void sessionManager.restorePersistedSessions().catch((error: unknown) => logger.error({ err: error }, 'Restore session gagal saat startup'));
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Graceful shutdown dimulai');
  await sessionManager.shutdown();
  await new Promise<void>((resolve) => {
    socketServer.close(() => resolve());
  });
  await prisma.$disconnect().catch((error: unknown) => logger.error({ err: error }, 'Prisma disconnect gagal'));
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch(async (error: unknown) => {
  logger.fatal({ err: error }, 'Backend gagal dinyalakan');
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
