import { Router } from 'express';
import { pantryUpdateSchema } from '@fridgeorder/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { PantryItem } from '../models/PantryItem.js';
import { ownershipFilter } from '../utils/access.js';

export const pantryRouter = Router();
pantryRouter.use(requireAuth);

pantryRouter.get('/', async (req: AuthRequest, res) => {
  const householdId = req.query.householdId as string | undefined;
  const filter = await ownershipFilter(req.userId!, householdId);
  if (!filter) return res.status(403).json({ error: 'Sin acceso al hogar' });

  const inStock = { quantityOnHand: { $gt: 0 } };
  const items = householdId
    ? await PantryItem.find({ ...filter, ...inStock }).sort({ category: 1, name: 1 })
    : await PantryItem.find({ userId: req.userId, ...inStock }).sort({ category: 1, name: 1 });

  res.json({ items });
});

pantryRouter.patch('/:id', async (req: AuthRequest, res) => {
  const parsed = pantryUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await PantryItem.findOne({ _id: req.params.id, userId: req.userId });
  if (!item) return res.status(404).json({ error: 'No encontrado' });

  if (parsed.data.quantityOnHand != null) item.quantityOnHand = parsed.data.quantityOnHand;
  if (parsed.data.consumed != null) {
    item.quantityOnHand = Math.max(0, item.quantityOnHand - parsed.data.consumed);
  }
  if (parsed.data.notes != null) item.notes = parsed.data.notes;

  if (item.quantityOnHand <= 0) {
    await item.deleteOne();
    return res.json({ item: null, deleted: true });
  }

  await item.save();
  res.json({ item });
});

pantryRouter.delete('/:id', async (req: AuthRequest, res) => {
  const item = await PantryItem.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});
