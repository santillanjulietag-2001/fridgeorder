import { Router } from 'express';
import { createTripSchema, tripItemPatchSchema, voiceParseSchema } from '@fridgeorder/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { NeedItem } from '../models/NeedItem.js';
import { ShoppingTrip } from '../models/ShoppingTrip.js';
import { PantryItem } from '../models/PantryItem.js';
import { parseVoicePurchase } from '../services/ai.js';
import { productKeyFromName } from '../utils/access.js';

export const tripsRouter = Router();
tripsRouter.use(requireAuth);

tripsRouter.get('/', async (req: AuthRequest, res) => {
  const trips = await ShoppingTrip.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(30);
  res.json({ trips });
});

tripsRouter.get('/active', async (req: AuthRequest, res) => {
  const trip = await ShoppingTrip.findOne({
    userId: req.userId,
    status: { $in: ['planned', 'in_progress'] },
  }).sort({ createdAt: -1 });
  res.json({ trip });
});

tripsRouter.get('/:id', async (req: AuthRequest, res) => {
  const trip = await ShoppingTrip.findOne({ _id: req.params.id, userId: req.userId });
  if (!trip) return res.status(404).json({ error: 'No encontrado' });
  res.json({ trip });
});

tripsRouter.post('/', async (req: AuthRequest, res) => {
  const parsed = createTripSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const needs = await NeedItem.find({
    _id: { $in: parsed.data.needIds },
    userId: req.userId,
  });
  if (!needs.length) return res.status(400).json({ error: 'Sin necesidades válidas' });

  const items = needs.map((n) => ({
    needId: n._id,
    name: n.name,
    category: n.category,
    plannedQty: n.quantity,
    plannedPrice: n.estimatedPrice,
    purchased: false,
    unit: n.unit,
  }));

  const plannedTotal = items.reduce(
    (sum, i) => sum + (i.plannedPrice || 0) * (i.plannedQty || 1),
    0
  );

  await NeedItem.updateMany(
    { _id: { $in: needs.map((n) => n._id) } },
    { $set: { status: 'selected' } }
  );

  const trip = await ShoppingTrip.create({
    userId: req.userId,
    householdId: parsed.data.householdId,
    selectedNeedIds: needs.map((n) => n._id),
    items,
    plannedTotal: Number(plannedTotal.toFixed(2)),
    actualTotal: 0,
    status: 'planned',
  });

  res.status(201).json({ trip });
});

tripsRouter.post('/:id/start', async (req: AuthRequest, res) => {
  const trip = await ShoppingTrip.findOne({ _id: req.params.id, userId: req.userId });
  if (!trip) return res.status(404).json({ error: 'No encontrado' });
  trip.status = 'in_progress';
  await trip.save();
  res.json({ trip });
});

tripsRouter.patch('/:id/items', async (req: AuthRequest, res) => {
  const parsed = tripItemPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const trip = await ShoppingTrip.findOne({ _id: req.params.id, userId: req.userId });
  if (!trip) return res.status(404).json({ error: 'No encontrado' });

  const item = trip.items.id(parsed.data.itemId);
  if (!item) return res.status(404).json({ error: 'Ítem no encontrado' });

  if (parsed.data.actualQty != null) item.actualQty = parsed.data.actualQty;
  if (parsed.data.actualPrice != null) item.actualPrice = parsed.data.actualPrice;
  if (parsed.data.purchased != null) item.purchased = parsed.data.purchased;
  if (trip.status === 'planned') trip.status = 'in_progress';

  trip.actualTotal = Number(
    trip.items
      .filter((i) => i.purchased)
      .reduce((sum, i) => sum + (i.actualPrice ?? i.plannedPrice ?? 0) * (i.actualQty ?? i.plannedQty), 0)
      .toFixed(2)
  );

  await trip.save();
  res.json({ trip });
});

tripsRouter.post('/:id/voice', async (req: AuthRequest, res) => {
  const parsed = voiceParseSchema.safeParse({ ...req.body, tripId: req.params.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const trip = await ShoppingTrip.findOne({ _id: req.params.id, userId: req.userId });
  if (!trip) return res.status(404).json({ error: 'No encontrado' });

  const names = trip.items.map((i) => i.name);
  const result = await parseVoicePurchase(parsed.data.transcript, names);
  if (!result.matchedName) {
    return res.status(422).json({ error: 'No se reconoció el producto', result });
  }

  const item = trip.items.find(
    (i) => i.name.toLowerCase() === result.matchedName!.toLowerCase()
  ) || trip.items.find((i) =>
    i.name.toLowerCase().includes(result.matchedName!.toLowerCase().split(' ')[0]!)
  );

  if (!item) return res.status(422).json({ error: 'Producto no está en la lista', result });

  if (result.purchased !== false) item.purchased = true;
  if (result.actualPrice != null) item.actualPrice = result.actualPrice;
  if (result.actualQty != null) item.actualQty = result.actualQty;
  if (trip.status === 'planned') trip.status = 'in_progress';

  trip.actualTotal = Number(
    trip.items
      .filter((i) => i.purchased)
      .reduce((sum, i) => sum + (i.actualPrice ?? i.plannedPrice ?? 0) * (i.actualQty ?? i.plannedQty), 0)
      .toFixed(2)
  );

  await trip.save();
  res.json({ trip, matchedItemId: item._id, result });
});

tripsRouter.post('/:id/complete', async (req: AuthRequest, res) => {
  const trip = await ShoppingTrip.findOne({ _id: req.params.id, userId: req.userId });
  if (!trip) return res.status(404).json({ error: 'No encontrado' });

  const consumptions = (req.body?.consumptions || []) as {
    needId: string;
    boughtQty: number;
    alreadyConsumed: number;
  }[];

  for (const item of trip.items.filter((i) => i.purchased)) {
    const cons = consumptions.find((c) => c.needId === item.needId.toString());
    const bought = cons?.boughtQty ?? item.actualQty ?? item.plannedQty;
    const already = cons?.alreadyConsumed ?? 0;
    const onHand = Math.max(0, bought - already);
    const key = productKeyFromName(item.name);

    await PantryItem.findOneAndUpdate(
      { userId: req.userId, productKey: key },
      {
        $set: {
          name: item.name,
          category: item.category,
          unit: item.unit,
          lastBoughtAt: new Date(),
        },
        $inc: { quantityOnHand: onHand },
        $setOnInsert: { userId: req.userId, productKey: key, householdId: trip.householdId },
      },
      { upsert: true, new: true }
    );

    await NeedItem.findByIdAndUpdate(item.needId, { status: 'bought' });
  }

  // Mark unselected remaining needs stay as needed; selected but not purchased -> needed again
  for (const item of trip.items.filter((i) => !i.purchased)) {
    await NeedItem.findByIdAndUpdate(item.needId, { status: 'needed' });
  }

  trip.status = 'completed';
  trip.completedAt = new Date();
  trip.actualTotal = Number(
    trip.items
      .filter((i) => i.purchased)
      .reduce((sum, i) => sum + (i.actualPrice ?? i.plannedPrice ?? 0) * (i.actualQty ?? i.plannedQty), 0)
      .toFixed(2)
  );
  await trip.save();

  res.json({ trip });
});
