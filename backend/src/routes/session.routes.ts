import { Router } from 'express';
import {
  createSession,
  deleteSession,
  getSessionStatus,
  listSessions,
  requestPairingCode,
  verifyPairing
} from '../controllers/session-controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const sessionRouter = Router();
sessionRouter.get('/', asyncHandler(listSessions));
sessionRouter.post('/', asyncHandler(createSession));
sessionRouter.post('/:id/pairing', asyncHandler(requestPairingCode));
sessionRouter.post('/:id/verify', asyncHandler(verifyPairing));
sessionRouter.get('/:id/status', asyncHandler(getSessionStatus));
sessionRouter.delete('/:id', asyncHandler(deleteSession));
