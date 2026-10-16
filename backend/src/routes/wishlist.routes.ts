import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { createWishlistRequest, listWishlist } from '../services/wishlist.service.js';
import { runWishlistNotifications } from '../services/wishlist-notification.service.js';

export const wishlistRouter = Router();
wishlistRouter.get('/', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await listWishlist(req.query, req.user!.id));
}));
wishlistRouter.post('/', asyncHandler(async (req, res) => {
  const request = await createWishlistRequest(req.user!, req.body);
  res.status(201).json({ request });
  void runWishlistNotifications();
}));
