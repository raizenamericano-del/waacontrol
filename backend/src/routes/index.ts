import { Router } from 'express';
import { sessionRouter } from './session.routes.js';
import { messageRouter } from './message.routes.js';
import { mediaRouter } from './media.routes.js';
import { apiRateLimit } from '../middleware/rate-limits.js';

export const apiRouter = Router();
apiRouter.use(apiRateLimit);
apiRouter.use('/sessions', sessionRouter);
apiRouter.use('/', messageRouter);
apiRouter.use('/media', mediaRouter);
