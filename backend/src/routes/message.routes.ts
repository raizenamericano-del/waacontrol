import { Router } from 'express';
import { getChats, getMessages, sendMessage, uploadMedia } from '../controllers/message-controller.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendRateLimit } from '../middleware/rate-limits.js';

export const messageRouter = Router();
messageRouter.post('/messages/send', sendRateLimit, uploadMedia.single('media'), asyncHandler(sendMessage));
messageRouter.get('/messages/:sessionId', asyncHandler(getMessages));
messageRouter.get('/chats/:sessionId', asyncHandler(getChats));
