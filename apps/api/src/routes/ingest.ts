import { Router } from 'express';
import { guessCategory, ingestProductSchema } from '@fridgeorder/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { NeedItem } from '../models/NeedItem.js';
import { ProductSnapshot } from '../models/ProductSnapshot.js';
import { structureProductFromPage } from '../services/ai.js';

export const ingestRouter = Router();
ingestRouter.use(requireAuth);

ingestRouter.post('/product', async (req: AuthRequest, res) => {
  const parsed = ingestProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;
  const structured = await structureProductFromPage({
    store: data.store,
    storeUrl: data.storeUrl,
    title: data.title,
    brand: data.brand,
    price: data.price,
    rawText: data.rawText,
  });

  const snapshot = await ProductSnapshot.create({
    userId: req.userId,
    store: data.store,
    storeUrl: data.storeUrl,
    title: structured.title,
    brand: structured.brand || data.brand || '',
    price: structured.price ?? data.price,
    unitPrice: structured.unitPrice || data.unitPrice || '',
    imageUrl: data.imageUrl || '',
    rawHtmlDigest: (data.rawText || '').slice(0, 2000),
    capturedAt: new Date(),
  });

  const item = await NeedItem.create({
    userId: req.userId,
    householdId: data.householdId,
    name: structured.title,
    category: data.category || structured.category || guessCategory(structured.title),
    quantity: data.quantity ?? 1,
    unit: 'ud',
    notes: data.brand || structured.brand || '',
    preferredStore: data.store,
    estimatedPrice: structured.price ?? data.price,
    priceSource: structured.price != null || data.price != null ? 'scraped' : 'manual',
    source: 'extension',
    status: 'needed',
    productSnapshotId: snapshot._id,
  });

  res.status(201).json({ item, snapshot });
});
