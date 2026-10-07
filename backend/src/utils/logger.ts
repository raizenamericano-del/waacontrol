import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'headers.cookie',
      'password',
      'phoneNumber',
      'pairingCode',
      'creds',
      'authState',
      'token'
    ],
    censor: '[REDACTED]'
  },
  base: { service: 'wa-controller-api', environment: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime
});

export const baileysLogger = pino({
  level: env.BAILEYS_LOG_LEVEL,
  base: { service: 'baileys' },
  redact: { paths: ['creds', 'authState', 'password', 'token'], censor: '[REDACTED]' }
});
