import { Router } from 'express';
import {
  guessCategory,
  identifyProductImageSchema,
  needCreateSchema,
  needSelectionSchema,
  needUpdateSchema,
  pickProductSchema,
  productSearchSchema,
  spokenListSchema,
  suggestBasicNeedsSchema,
  suggestContextSchema,
} from '@fridgeorder/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { MealPreferences } from '../models/MealPreferences.js';
import { NeedItem } from '../models/NeedItem.js';
import { PantryItem } from '../models/PantryItem.js';
import { ProductSnapshot } from '../models/ProductSnapshot.js';
import {
  estimatePrices,
  identifyProductFromImage,
  parseSpokenShoppingList,
  suggestBasicNutritionalNeeds,
  suggestShoppingFromContext,
} from '../services/ai.js';
import { searchSupermarketProducts } from '../services/superSearch.js';
import { ownershipFilter } from '../utils/access.js';

export const needsRouter = Router();
needsRouter.use(requireAuth);

needsRouter.get('/', async (req: AuthRequest, res) => {
  const householdId = req.query.householdId as string | undefined;
  const status = req.query.status as string | undefined;
  const filter = await ownershipFilter(req.userId!, householdId);
  if (!filter) return res.status(403).json({ error: 'Sin acceso al hogar' });

  const q: Record<string, unknown> = { ...filter };
  if (status) q.status = status;
  else q.status = { $in: ['needed', 'selected'] };

  const items = await NeedItem.find(q).sort({ category: 1, createdAt: -1 });
  res.json({ items });
});

needsRouter.post('/search-products', async (req: AuthRequest, res) => {
  const parsed = productSearchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const result = await searchSupermarketProducts(parsed.data.query);
  res.json(result);
});

needsRouter.post('/parse-spoken-list', async (req: AuthRequest, res) => {
  const parsed = spokenListSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { items, source } = await parseSpokenShoppingList(parsed.data.transcript);
  res.json({ items, transcript: parsed.data.transcript, source });
});

needsRouter.post('/suggest-basic', async (req: AuthRequest, res) => {
  const parsed = suggestBasicNeedsSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let prefs = await MealPreferences.findOne({ userId: req.userId! });
  if (!prefs) prefs = await MealPreferences.create({ userId: req.userId! });

  const pantry = await PantryItem.find({ userId: req.userId!, quantityOnHand: { $gt: 0 } });
  const alreadyNeeded = await NeedItem.find({
    userId: req.userId!,
    status: { $in: ['needed', 'selected'] },
  }).select('name');

  const goals = [...(prefs.goals || [])];
  const customGoal = (prefs.otherGoal || '').trim();
  if (goals.includes('other') && customGoal) goals.push(customGoal);

  const { items, source } = await suggestBasicNutritionalNeeds({
    goals,
    dietStyle: prefs.dietStyle || 'general',
    allergies: prefs.allergies || [],
    restrictions: prefs.restrictions || [],
    dislikedIngredients: prefs.dislikedIngredients || [],
    forbiddenIngredients: prefs.forbiddenIngredients || [],
    favoriteIngredients: prefs.favoriteIngredients || [],
    adults: prefs.adults || 1,
    children: prefs.children || 0,
    pantryNames: pantry.map((p) => p.name),
    alreadyNeeded: alreadyNeeded.map((n) => n.name),
    count: parsed.data.count,
  });

  res.json({
    items,
    source,
    basedOn: {
      goals: prefs.goals || [],
      dietStyle: prefs.dietStyle || 'general',
    },
  });
});

needsRouter.post('/suggest-context', async (req: AuthRequest, res) => {
  const parsed = suggestContextSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let prefs = await MealPreferences.findOne({ userId: req.userId! });
  if (!prefs) prefs = await MealPreferences.create({ userId: req.userId! });

  const pantry = await PantryItem.find({ userId: req.userId!, quantityOnHand: { $gt: 0 } });
  const alreadyNeeded = await NeedItem.find({
    userId: req.userId!,
    status: { $in: ['needed', 'selected'] },
  }).select('name');

  const { items, source } = await suggestShoppingFromContext({
    context: parsed.data.context,
    pantryNames: pantry.map((p) => p.name),
    alreadyNeeded: alreadyNeeded.map((n) => n.name),
    allergies: prefs.allergies || [],
    count: parsed.data.count,
  });

  res.json({
    items,
    source,
    context: parsed.data.context,
  });
});

needsRouter.post('/identify-product', async (req: AuthRequest, res) => {
  const parsed = identifyProductImageSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (!config.openaiApiKey) {
    return res.status(503).json({
      error:
        'Para reconocer fotos hace falta OPENAI_API_KEY en el archivo .env. Sin clave, voz y heurísticas sí funcionan; la foto no.',
    });
  }

  const result = await identifyProductFromImage(parsed.data.imageDataUrl);
  if (!result?.items?.length) {
    return res.status(422).json({ error: 'No pude identificar productos en la foto' });
  }
  res.json(result);
});

needsRouter.post('/pick-product', async (req: AuthRequest, res) => {
  const parsed = pickProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  let snapshotId;
  if (data.storeUrl) {
    try {
      const snapshot = await ProductSnapshot.create({
        userId: req.userId,
        store: data.store,
        storeUrl: data.storeUrl,
        title: data.title,
        brand: data.brand || '',
        price: data.price,
        unitPrice: data.unitPrice || '',
        imageUrl: data.imageUrl || '',
        rawHtmlDigest: `search:${data.sourceHint || 'ai'}`,
        capturedAt: new Date(),
      });
      snapshotId = snapshot._id;
    } catch {
      /* optional */
    }
  }

  const item = await NeedItem.create({
    userId: req.userId,
    householdId: data.householdId,
    name: data.title,
    category: data.category || guessCategory(data.title),
    quantity: data.quantity ?? 1,
    unit: 'ud',
    notes: [data.brand, data.unitPrice].filter(Boolean).join(' · '),
    preferredStore: data.store,
    estimatedPrice: data.price,
    priceSource: data.price != null ? (data.sourceHint === 'live' ? 'scraped' : 'ai_avg') : 'manual',
    source: 'manual',
    status: 'selected',
    brand: data.brand || '',
    unitPrice: data.unitPrice || '',
    imageUrl: data.imageUrl || '',
    storeUrl: data.storeUrl || '',
    productSnapshotId: snapshotId,
  });

  res.status(201).json({ item });
});

needsRouter.post('/', async (req: AuthRequest, res) => {
  const parsed = needCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;
  const item = await NeedItem.create({
    userId: req.userId,
    householdId: data.householdId,
    name: data.name,
    category: data.category || guessCategory(data.name),
    quantity: data.quantity ?? 1,
    unit: data.unit || 'ud',
    notes: data.notes || '',
    preferredStore: data.preferredStore || 'other',
    estimatedPrice: data.estimatedPrice,
    priceSource: data.priceSource || (data.estimatedPrice != null ? 'manual' : 'manual'),
    source: data.source || 'manual',
    status: 'selected',
  });
  res.status(201).json({ item });
});

needsRouter.post('/selection', async (req: AuthRequest, res) => {
  const parsed = needSelectionSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const status = parsed.data.selected ? 'selected' : 'needed';
  const result = await NeedItem.updateMany(
    { _id: { $in: parsed.data.ids }, userId: req.userId },
    { $set: { status } }
  );
  res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount, status });
});

needsRouter.patch('/:id', async (req: AuthRequest, res) => {
  const parsed = needUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await NeedItem.findOne({ _id: req.params.id, userId: req.userId });
  if (!item) {
    const shared = await NeedItem.findById(req.params.id);
    if (!shared?.householdId || !req.user!.householdIds.some((id) => id.equals(shared.householdId!))) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    Object.assign(shared, parsed.data);
    if (parsed.data.name && !parsed.data.category) shared.category = guessCategory(parsed.data.name);
    await shared.save();
    return res.json({ item: shared });
  }

  Object.assign(item, parsed.data);
  if (parsed.data.name && !parsed.data.category) item.category = guessCategory(parsed.data.name);
  await item.save();
  res.json({ item });
});

needsRouter.delete('/:id', async (req: AuthRequest, res) => {
  const item = await NeedItem.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

needsRouter.post('/estimate-prices', async (req: AuthRequest, res) => {
  const householdId = req.body?.householdId as string | undefined;
  const filter = await ownershipFilter(req.userId!, householdId);
  if (!filter) return res.status(403).json({ error: 'Sin acceso al hogar' });

  const items = await NeedItem.find({
    ...filter,
    status: { $in: ['needed', 'selected'] },
    $or: [{ estimatedPrice: { $exists: false } }, { estimatedPrice: null }],
  });

  if (!items.length) return res.json({ items: [], updated: 0 });

  const estimates = await estimatePrices(
    items.map((i) => ({
      name: i.name,
      category: i.category,
      preferredStore: i.preferredStore,
    }))
  );

  for (const item of items) {
    const est = estimates.find((e) => e.name === item.name);
    if (est) {
      item.estimatedPrice = est.estimatedPrice;
      item.priceSource = 'ai_avg';
      await item.save();
    }
  }

  const refreshed = await NeedItem.find({
    ...filter,
    status: { $in: ['needed', 'selected'] },
  }).sort({ category: 1 });

  res.json({ items: refreshed, updated: items.length });
});
