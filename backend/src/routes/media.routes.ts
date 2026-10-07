import { Router } from 'express';
import { getMedia } from '../controllers/media-controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const mediaRouter = Router();
mediaRouter.get('/:filename', asyncHandler(getMedia));
