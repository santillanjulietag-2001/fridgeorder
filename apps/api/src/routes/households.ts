import { Router } from 'express';
import { householdCreateSchema, householdJoinSchema } from '@fridgeorder/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { Household } from '../models/Household.js';
import { User } from '../models/User.js';
import { randomInviteCode } from '../utils/access.js';

export const householdsRouter = Router();
householdsRouter.use(requireAuth);

householdsRouter.get('/', async (req: AuthRequest, res) => {
  const households = await Household.find({ memberIds: req.userId });
  res.json({ households });
});

householdsRouter.post('/', async (req: AuthRequest, res) => {
  const parsed = householdCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const household = await Household.create({
    name: parsed.data.name,
    ownerId: req.userId,
    memberIds: [req.userId],
    inviteCode: randomInviteCode(),
  });

  await User.findByIdAndUpdate(req.userId, { $addToSet: { householdIds: household._id } });
  res.status(201).json({ household });
});

householdsRouter.post('/join', async (req: AuthRequest, res) => {
  const parsed = householdJoinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const household = await Household.findOne({
    inviteCode: parsed.data.inviteCode.toUpperCase(),
  });
  if (!household) return res.status(404).json({ error: 'Código inválido' });

  if (!household.memberIds.some((id) => id.toString() === req.userId)) {
    household.memberIds.push(req.user!._id);
    await household.save();
  }
  await User.findByIdAndUpdate(req.userId, { $addToSet: { householdIds: household._id } });
  res.json({ household });
});

householdsRouter.get('/:id', async (req: AuthRequest, res) => {
  const household = await Household.findOne({ _id: req.params.id, memberIds: req.userId });
  if (!household) return res.status(404).json({ error: 'No encontrado' });
  res.json({ household });
});
