import { Router } from 'express';
import { settingsSchema } from '@fridgeorder/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get('/settings', (req: AuthRequest, res) => {
  res.json({ settings: req.user!.settings });
});

meRouter.patch('/settings', async (req: AuthRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  Object.assign(req.user!.settings, parsed.data);
  await req.user!.save();
  res.json({ settings: req.user!.settings });
});
