import { Router } from 'express';
import {
  guessCategory,
  mealActionSchema,
  mealGenerateSchema,
  mealPreferencesSchema,
  mealSwipeSchema,
  normalizeWeekday,
  recipeOptionsSchema,
} from '@fridgeorder/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { MealPlan } from '../models/MealPlan.js';
import { MealPreferences } from '../models/MealPreferences.js';
import { NeedItem } from '../models/NeedItem.js';
import { PantryItem } from '../models/PantryItem.js';
import {
  generateBatchSession,
  generateMealPlan,
  generateRecipe,
  suggestDishCards,
  suggestReplacementMeal,
} from '../services/ai.js';
import { upsertSavedRecipe, bodyFromMeal, explanationFromMeal } from '../services/savedRecipes.js';
import { productKeyFromName } from '../utils/access.js';

export const mealsRouter = Router();
mealsRouter.use(requireAuth);

function mondayOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateForWeekDay(weekStart: string, day: string): string {
  const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const key = normalizeWeekday(day) || day.toLowerCase();
  const idx = days.indexOf(key);
  if (idx < 0) return weekStart;
  return addDaysIso(weekStart, idx);
}

async function getOrCreatePrefs(userId: string) {
  let prefs = await MealPreferences.findOne({ userId });
  if (!prefs) {
    prefs = await MealPreferences.create({ userId });
  }
  return prefs;
}

async function pantryNames(userId: string) {
  const pantry = await PantryItem.find({ userId, quantityOnHand: { $gt: 0 } });
  return { pantry, names: pantry.map((p) => p.name) };
}

mealsRouter.get('/preferences', async (req: AuthRequest, res) => {
  const prefs = await getOrCreatePrefs(req.userId!);
  res.json({ preferences: prefs });
});

mealsRouter.put('/preferences', async (req: AuthRequest, res) => {
  const parsed = mealPreferencesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const prefs = await getOrCreatePrefs(req.userId!);
  Object.assign(prefs, parsed.data);
  if (parsed.data.portions) {
    // keep in sync with user settings people roughly
  }
  await prefs.save();
  res.json({ preferences: prefs });
});

mealsRouter.get('/swipe-cards', async (req: AuthRequest, res) => {
  const prefs = await getOrCreatePrefs(req.userId!);
  const { names } = await pantryNames(req.userId!);
  const dishes = await suggestDishCards({
    prefs: prefs.toObject(),
    pantryNames: names,
    blockedKeys: prefs.neverSuggestDishKeys || [],
    count: 10,
  });
  res.json({ dishes });
});

mealsRouter.post('/swipe', async (req: AuthRequest, res) => {
  const parsed = mealSwipeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const prefs = await getOrCreatePrefs(req.userId!);
  prefs.swipes.push({
    dishKey: parsed.data.dishKey,
    title: parsed.data.title,
    rating: parsed.data.rating,
    notes: parsed.data.notes || '',
    at: new Date(),
  });
  if (parsed.data.rating === 'never_again' || parsed.data.rating === 'dislike') {
    if (!prefs.neverSuggestDishKeys.includes(parsed.data.dishKey)) {
      prefs.neverSuggestDishKeys.push(parsed.data.dishKey);
    }
  }
  if (parsed.data.rating === 'like' || parsed.data.rating === 'want_to_try') {
    if (!prefs.favoriteIngredients.includes(parsed.data.title)) {
      // store liked dish titles lightly in favorites list as dish labels
    }
  }
  await prefs.save();
  res.json({ preferences: prefs });
});

mealsRouter.get('/current', async (req: AuthRequest, res) => {
  const weekStart = (req.query.weekStart as string) || mondayOfWeek();
  const plan = await MealPlan.findOne({ userId: req.userId, weekStart }).sort({ createdAt: -1 });
  const prefs = await getOrCreatePrefs(req.userId!);
  res.json({ plan, weekStart, preferences: prefs });
});

mealsRouter.post('/generate', async (req: AuthRequest, res) => {
  const parsed = mealGenerateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const prefs = await getOrCreatePrefs(req.userId!);
  const weekStart = parsed.data.weekStart || mondayOfWeek();
  const peopleCount =
    parsed.data.peopleCount || prefs.portions || req.user!.settings.peopleCount || 2;
  const dietaryNotes =
    parsed.data.dietaryNotes ??
    [
      prefs.dietStyle,
      ...(prefs.allergies || []),
      ...(prefs.restrictions || []),
      req.user!.settings.dietaryNotes,
    ]
      .filter(Boolean)
      .join('; ');

  const { pantry, names } = await pantryNames(req.userId!);
  const likedDishes = prefs.swipes
    .filter((s) => ['like', 'want_to_try', 'like_with_changes'].includes(s.rating))
    .map((s) => s.title);
  const blockedDishes = [
    ...prefs.neverSuggestDishKeys,
    ...prefs.swipes.filter((s) => s.rating === 'dislike' || s.rating === 'never_again').map((s) => s.title),
  ];

  const generated = await generateMealPlan({
    pantry: pantry.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      quantityOnHand: p.quantityOnHand,
      category: p.category,
    })),
    peopleCount,
    dietaryNotes,
    weekStart,
    prefs: prefs.toObject(),
    likedDishes,
    blockedDishes,
  });

  const meals = [];
  for (const m of generated.meals) {
    const scheduledDate = dateForWeekDay(weekStart, m.day);
    const mealDoc: Record<string, unknown> = {
      ...m,
      status: 'planned',
      originalDate: scheduledDate,
      scheduledDate,
      weekStart,
      portions: peopleCount,
      prepIds: [],
    };

    if (parsed.data.includeRecipes !== false) {
      const recipe = await generateRecipe({
        title: m.title,
        ingredients: m.ingredients,
        pantryNames: names,
        servings: peopleCount,
        prefs: prefs.toObject(),
      });
      mealDoc.recipe = recipe;
      if (recipe.nutritionNote) mealDoc.nutritionNote = recipe.nutritionNote;
      // push missing ingredients to needs list
      for (const miss of recipe.missingIngredientNames || []) {
        const exists = await NeedItem.findOne({
          userId: req.userId,
          name: new RegExp(`^${miss.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          status: { $in: ['needed', 'selected'] },
        });
        if (!exists) {
          await NeedItem.create({
            userId: req.userId,
            name: miss,
            category: guessCategory(miss),
            quantity: 1,
            unit: 'ud',
            notes: `Para receta: ${m.title}`,
            source: 'manual',
            status: 'needed',
            priceSource: 'manual',
          });
        }
      }
    }

    meals.push(mealDoc);
  }

  const preps = generated.preps.map((p) => ({
    title: p.title,
    whenLabel: p.whenLabel,
    durationMinutes: p.durationMinutes,
    usedByMealIds: [],
    portions: peopleCount,
    fridgeDays: 4,
    freezable: p.freezable,
    storageNotes: p.storageNotes,
    ingredients: p.ingredients,
  }));

  const plan = await MealPlan.create({
    userId: req.userId,
    householdId: parsed.data.householdId,
    weekStart,
    meals,
    preps,
  });

  // link prep -> meals by title match, then mark batch vs same-day
  for (const prep of plan.preps) {
    const related = generated.preps.find((p) => p.title === prep.title);
    const byTitle = plan.meals.filter((m) => {
      const fromPrep = (m.fromPrepTitle || '').trim().toLowerCase();
      if (fromPrep && fromPrep === prep.title.toLowerCase()) return true;
      if (!related?.forMeals?.length) return false;
      return related.forMeals.some(
        (t) =>
          m.title.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(m.title.toLowerCase())
      );
    });
    prep.usedByMealIds = byTitle.map((m) => m._id);
    for (const meal of byTitle) {
      meal.source = 'batch';
      meal.fromPrepTitle = prep.title;
      if (!meal.prepIds.some((id) => String(id) === String(prep._id))) {
        meal.prepIds.push(prep._id);
      }
    }
  }
  for (const meal of plan.meals) {
    if (meal.source !== 'batch' && !meal.fromPrepTitle) meal.source = 'same_day';
  }
  await plan.save();

  if (parsed.data.includeBatch !== false && plan.preps.length) {
    // store batch session lightly in prep storageNotes header — or attach as virtual via separate endpoint
  }

  res.status(201).json({ plan });
});

mealsRouter.post('/:planId/meals/:mealId/action', async (req: AuthRequest, res) => {
  const parsed = mealActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const plan = await MealPlan.findOne({ _id: req.params.planId, userId: req.userId });
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  const meal = plan.meals.id(req.params.mealId);
  if (!meal) return res.status(404).json({ error: 'Comida no encontrada' });

  const action = parsed.data.action;
  const prefs = await getOrCreatePrefs(req.userId!);
  const { names } = await pantryNames(req.userId!);

  if (action === 'move_day') {
    if (!parsed.data.targetDay) return res.status(400).json({ error: 'Falta targetDay' });
    meal.day = parsed.data.targetDay;
    if (parsed.data.targetSlot) meal.slot = parsed.data.targetSlot;
    meal.scheduledDate = dateForWeekDay(plan.weekStart, meal.day);
    meal.status = 'planned';
  } else if (action === 'save_next_week') {
    const nextWeek = addDaysIso(plan.weekStart, 7);
    meal.status = 'saved_for_next_week';
    meal.weekStart = nextWeek;
    meal.scheduledDate = dateForWeekDay(nextWeek, meal.day);
    // ensure next week plan exists and receive the meal
    let next = await MealPlan.findOne({ userId: req.userId, weekStart: nextWeek });
    if (!next) {
      next = await MealPlan.create({
        userId: req.userId,
        weekStart: nextWeek,
        meals: [],
        preps: [],
      });
    }
    const clone = meal.toObject();
    // @ts-expect-error strip id for insert into another plan
    delete clone._id;
    next.meals.push(clone);
    await next.save();
    meal.status = 'postponed';
  } else if (action === 'postpone') {
    meal.status = 'postponed';
  } else if (action === 'replace') {
    const replacement = parsed.data.newTitle
      ? {
          title: parsed.data.newTitle,
          ingredients: meal.ingredients,
          nutritionNote: meal.nutritionNote || { summary: 'Comida reemplazada manualmente.' },
        }
      : await suggestReplacementMeal({
          currentTitle: meal.title,
          day: meal.day,
          slot: meal.slot,
          pantryNames: names,
          prefs: prefs.toObject(),
        });
    meal.replacedByTitle = meal.title;
    meal.title = replacement.title;
    meal.ingredients = replacement.ingredients;
    meal.nutritionNote = replacement.nutritionNote;
    meal.status = 'replaced';
    meal.recipe = undefined;
  } else if (action === 'ate_other') {
    meal.status = 'replaced';
    meal.replacedByTitle = meal.title;
    meal.title = parsed.data.ateOtherTitle || 'Otra cosa';
    meal.rejectReason = 'Hoy comí otra cosa';
  } else if (action === 'set_status') {
    if (!parsed.data.status) return res.status(400).json({ error: 'Falta status' });
    meal.status = parsed.data.status;
  } else if (action === 'accept') {
    meal.status = 'accepted';
  } else if (action === 'reject') {
    meal.status = 'rejected';
    meal.rejectReason = parsed.data.rejectReason || '';
    const key = productKeyFromName(meal.title);
    if (!prefs.neverSuggestDishKeys.includes(key)) prefs.neverSuggestDishKeys.push(key);
    await prefs.save();
  } else if (action === 'clear_day') {
    meal.status = 'postponed';
    meal.title = `(Sin plan) ${meal.slot}`;
    meal.ingredients = [];
  }

  await plan.save();
  res.json({ plan, meal });
});

mealsRouter.post('/:planId/meals/:mealId/recipe', async (req: AuthRequest, res) => {
  const parsed = recipeOptionsSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const plan = await MealPlan.findOne({ _id: req.params.planId, userId: req.userId });
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  const meal = plan.meals.id(req.params.mealId);
  if (!meal) return res.status(404).json({ error: 'Comida no encontrada' });

  const prefs = await getOrCreatePrefs(req.userId!);
  const { names } = await pantryNames(req.userId!);
  const recipe = await generateRecipe({
    title: meal.title,
    ingredients: meal.ingredients,
    pantryNames: names,
    servings: parsed.data.servings || meal.portions || prefs.portions || 2,
    prefs: prefs.toObject(),
    mode: parsed.data.mode,
    replaceIngredient: parsed.data.replaceIngredient,
  });
  meal.recipe = recipe;
  if (recipe.nutritionNote) meal.nutritionNote = recipe.nutritionNote;
  if (parsed.data.servings) meal.portions = parsed.data.servings;

  for (const miss of recipe.missingIngredientNames || []) {
    const exists = await NeedItem.findOne({
      userId: req.userId,
      name: new RegExp(`^${miss.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      status: { $in: ['needed', 'selected'] },
    });
    if (!exists) {
      await NeedItem.create({
        userId: req.userId,
        name: miss,
        category: guessCategory(miss),
        quantity: 1,
        notes: `Para receta: ${meal.title}`,
        status: 'needed',
        source: 'manual',
      });
    }
  }

  await plan.save();
  res.json({ plan, meal, recipe });
});

mealsRouter.post('/:planId/meals/:mealId/cook', async (req: AuthRequest, res) => {
  const plan = await MealPlan.findOne({ _id: req.params.planId, userId: req.userId });
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  const meal = plan.meals.id(req.params.mealId);
  if (!meal) return res.status(404).json({ error: 'Comida no encontrada' });

  // deduct pantry for ingredients found
  for (const name of meal.recipe?.pantryIngredientNames || meal.ingredients) {
    const key = productKeyFromName(name);
    const item = await PantryItem.findOne({ userId: req.userId, productKey: key });
    if (item && item.quantityOnHand > 0) {
      item.quantityOnHand = Math.max(0, item.quantityOnHand - 1);
      if (item.quantityOnHand <= 0) await item.deleteOne();
      else await item.save();
    }
  }
  meal.status = 'prepared';
  await plan.save();
  const savedRecipe = await upsertSavedRecipe({
    userId: req.userId!,
    title: meal.title,
    explanation: explanationFromMeal(meal),
    ingredients: meal.ingredients,
    recipe: bodyFromMeal(meal),
    nutritionSummary: meal.nutritionNote?.summary || '',
    cooked: true,
    source: 'plan',
  });
  res.json({ plan, meal, savedRecipe });
});

mealsRouter.post('/:planId/meals/:mealId/favorite-recipe', async (req: AuthRequest, res) => {
  const plan = await MealPlan.findOne({ _id: req.params.planId, userId: req.userId });
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  const meal = plan.meals.id(req.params.mealId);
  if (!meal?.recipe) return res.status(404).json({ error: 'Sin receta' });

  const prefs = await getOrCreatePrefs(req.userId!);
  prefs.swipes.push({
    dishKey: productKeyFromName(meal.title),
    title: meal.title,
    rating: 'like',
    notes: 'Receta favorita',
    at: new Date(),
  });
  await prefs.save();
  const savedRecipe = await upsertSavedRecipe({
    userId: req.userId!,
    title: meal.title,
    explanation: explanationFromMeal(meal),
    ingredients: meal.ingredients,
    recipe: bodyFromMeal(meal),
    nutritionSummary: meal.nutritionNote?.summary || '',
    favorite: true,
    source: 'plan',
  });
  res.json({ ok: true, preferences: prefs, savedRecipe });
});

mealsRouter.get('/:planId/batch', async (req: AuthRequest, res) => {
  const plan = await MealPlan.findOne({ _id: req.params.planId, userId: req.userId });
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

  const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const cookDay = String(req.query.cookDay || plan.batchCookDay || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!days.includes(cookDay)) {
    return res.status(400).json({ error: 'Elige el día en que vas a cocinar el batch' });
  }
  if (plan.batchCookDay !== cookDay) {
    plan.batchCookDay = cookDay;
    await plan.save();
  }

  const batch = await generateBatchSession({
    cookDay,
    preps: plan.preps.map((p) => ({
      title: p.title,
      durationMinutes: p.durationMinutes,
      ingredients: p.ingredients,
    })),
    meals: plan.meals.map((m) => ({ title: m.title, day: m.day })),
  });
  res.json({ batch, preps: plan.preps, cookDay });
});

mealsRouter.post('/:planId/swap', async (req: AuthRequest, res) => {
  const { mealIdA, mealIdB } = req.body || {};
  const plan = await MealPlan.findOne({ _id: req.params.planId, userId: req.userId });
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  const a = plan.meals.id(mealIdA);
  const b = plan.meals.id(mealIdB);
  if (!a || !b) return res.status(404).json({ error: 'Comidas no encontradas' });

  const tmp = {
    day: a.day,
    slot: a.slot,
    scheduledDate: a.scheduledDate,
  };
  a.day = b.day;
  a.slot = b.slot;
  a.scheduledDate = b.scheduledDate;
  b.day = tmp.day;
  b.slot = tmp.slot;
  b.scheduledDate = tmp.scheduledDate;
  await plan.save();
  res.json({ plan });
});
