import { Router } from 'express';
import { compareProductsSchema, cookReviewSchema } from '@fridgeorder/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { DailyRecipe } from '../models/DailyRecipe.js';
import { MealPreferences } from '../models/MealPreferences.js';
import { PantryItem } from '../models/PantryItem.js';
import { SavedRecipe } from '../models/SavedRecipe.js';
import { analyzeProductNutrition, generateRecipe, suggestDishCards } from '../services/ai.js';
import { upsertSavedRecipe } from '../services/savedRecipes.js';
import { productKeyFromName } from '../utils/access.js';

export const recipesRouter = Router();
recipesRouter.use(requireAuth);

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hashPick(seed: string, len: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return len ? h % len : 0;
}

recipesRouter.get('/preview', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const [favoritesCount, daily] = await Promise.all([
    SavedRecipe.countDocuments({ userId, favorite: true }),
    DailyRecipe.findOne({ userId, date: todayIso() }).select('title'),
  ]);
  res.json({
    favoritesCount,
    dailyTitle: daily?.title || '',
  });
});

recipesRouter.get('/', async (req: AuthRequest, res) => {
  const recipes = await SavedRecipe.find({ userId: req.userId, favorite: true })
    .sort({ updatedAt: -1 })
    .limit(60);
  res.json({ recipes });
});

recipesRouter.get('/daily', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const date = todayIso();
    let daily = await DailyRecipe.findOne({ userId, date });
    if (!daily) {
      const [prefs, pantry] = await Promise.all([
        MealPreferences.findOne({ userId }),
        PantryItem.find({ userId, quantityOnHand: { $gt: 0 } }),
      ]);
      const names = pantry.map((p) => p.name);
      const blocked = prefs?.neverSuggestDishKeys || [];
      const cards = await suggestDishCards({
        pantryNames: names,
        blockedKeys: blocked,
        count: 8,
      });
      const pick = cards[hashPick(`${userId}:${date}`, cards.length)] || cards[0];
      if (!pick) {
        return res.status(422).json({ error: 'No pude proponer receta hoy' });
      }
      const generated = await generateRecipe({
        title: pick.title,
        ingredients: names.slice(0, 8),
        pantryNames: names,
        servings: prefs?.portions || 2,
        prefs: prefs
          ? {
              dietStyle: prefs.dietStyle,
              allergies: prefs.allergies,
              dislikedIngredients: prefs.dislikedIngredients,
            }
          : undefined,
      });
      const explanation =
        pick.summary ||
        generated.nutritionNote?.summary ||
        `Sugerencia de hoy: ${pick.title}.`;
      try {
        daily = await DailyRecipe.create({
          userId,
          date,
          dishKey: pick.dishKey || productKeyFromName(pick.title),
          title: pick.title,
          explanation,
          ingredients: names.slice(0, 8),
          recipe: {
            servings: generated.servings,
            steps: generated.steps,
            prepMinutes: generated.prepMinutes,
            cookMinutes: generated.cookMinutes,
            totalMinutes: generated.totalMinutes,
            difficulty: generated.difficulty,
            tools: generated.tools,
            tips: generated.tips,
            pantryIngredientNames: generated.pantryIngredientNames,
            missingIngredientNames: generated.missingIngredientNames,
          },
          nutritionSummary: generated.nutritionNote?.summary || '',
        });
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (code !== 11000) throw err;
        daily = await DailyRecipe.findOne({ userId, date });
      }
    }
    if (!daily) {
      return res.status(500).json({ error: 'No se pudo guardar la receta del día' });
    }
    const saved = await SavedRecipe.findOne({ userId, dishKey: daily.dishKey });
    res.json({
      daily,
      favorited: Boolean(saved?.favorite),
      savedId: saved?.favorite ? String(saved._id) : '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'No se pudo cargar la receta del día',
    });
  }
});

recipesRouter.post('/daily/favorite', async (req: AuthRequest, res) => {
  const daily = await DailyRecipe.findOne({ userId: req.userId, date: todayIso() });
  if (!daily) return res.status(404).json({ error: 'No hay receta del día' });
  const saved = await upsertSavedRecipe({
    userId: req.userId!,
    title: daily.title,
    explanation: daily.explanation,
    ingredients: daily.ingredients,
    recipe: daily.recipe,
    nutritionSummary: daily.nutritionSummary,
    favorite: true,
    source: 'daily',
  });
  res.json({ recipe: saved });
});

recipesRouter.post('/compare', async (req: AuthRequest, res) => {
  const parsed = compareProductsSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!config.openaiApiKey) {
    return res.status(503).json({
      error: 'Para comparar fotos hace falta OPENAI_API_KEY en el archivo .env.',
    });
  }
  const images = [parsed.data.imageDataUrl, parsed.data.imageDataUrlB].filter(Boolean) as string[];
  const result = await analyzeProductNutrition(images);
  if (!result) {
    return res.status(422).json({ error: 'No pude leer la etiqueta. Prueba con más luz o más cerca.' });
  }
  res.json(result);
});

recipesRouter.delete('/:id/favorite', async (req: AuthRequest, res) => {
  const recipe = await SavedRecipe.findOne({ _id: req.params.id, userId: req.userId });
  if (!recipe) return res.status(404).json({ error: 'Receta no encontrada' });
  recipe.favorite = false;
  await recipe.save();
  res.json({ ok: true });
});

recipesRouter.post('/:id/review', async (req: AuthRequest, res) => {
  const parsed = cookReviewSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const recipe = await SavedRecipe.findOne({ _id: req.params.id, userId: req.userId });
  if (!recipe) return res.status(404).json({ error: 'Receta no encontrada' });
  if (parsed.data.rating) recipe.rating = parsed.data.rating;
  if (parsed.data.photoDataUrl?.startsWith('data:image/')) {
    recipe.photos.unshift({ dataUrl: parsed.data.photoDataUrl, at: new Date() });
    recipe.photos = recipe.photos.slice(0, 12);
  }
  await recipe.save();
  res.json({ recipe });
});
