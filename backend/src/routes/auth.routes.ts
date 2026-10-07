import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { login, logout, me } from '../controllers/auth-controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loginRateLimit } from '../middleware/rate-limits.js';

export const authRouter = Router();
authRouter.post('/login', loginRateLimit, asyncHandler(login));
authRouter.post('/logout', requireAuth, asyncHandler(async (req, res) => logout(req, res)));
authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => me(req, res)));
