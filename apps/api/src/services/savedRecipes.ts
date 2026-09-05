import type { IMeal } from '../models/MealPlan.js';
import { SavedRecipe, type ISavedRecipe, type ISavedRecipeBody } from '../models/SavedRecipe.js';
import { productKeyFromName } from '../utils/access.js';

export function explanationFromMeal(meal: Pick<IMeal, 'title' | 'recipe' | 'nutritionNote' | 'ingredients'>) {
  const bits = [
    meal.nutritionNote?.summary,
    meal.recipe?.tips?.[0],
    meal.ingredients?.length ? `Ingredientes: ${meal.ingredients.slice(0, 6).join(', ')}.` : '',
  ].filter(Boolean);
  return bits.join(' ') || `${meal.title}: receta guardada para repetirla.`;
}

export function bodyFromMeal(meal: Pick<IMeal, 'recipe' | 'portions'>): ISavedRecipeBody | undefined {
  if (!meal.recipe) return undefined;
  return {
    servings: meal.recipe.servings || meal.portions || 2,
    steps: meal.recipe.steps || [],
    prepMinutes: meal.recipe.prepMinutes,
    cookMinutes: meal.recipe.cookMinutes,
    totalMinutes: meal.recipe.totalMinutes,
    difficulty: meal.recipe.difficulty,
    tools: meal.recipe.tools || [],
    tips: meal.recipe.tips || [],
    pantryIngredientNames: meal.recipe.pantryIngredientNames || [],
    missingIngredientNames: meal.recipe.missingIngredientNames || [],
  };
}

export async function upsertSavedRecipe(input: {
  userId: string;
  title: string;
  explanation?: string;
  ingredients?: string[];
  recipe?: ISavedRecipeBody;
  nutritionSummary?: string;
  favorite?: boolean;
  cooked?: boolean;
  rating?: number;
  photoDataUrl?: string;
  source?: 'plan' | 'daily';
}): Promise<ISavedRecipe> {
  const dishKey = productKeyFromName(input.title);
  let doc = await SavedRecipe.findOne({ userId: input.userId, dishKey });
  if (!doc) {
    doc = await SavedRecipe.create({
      userId: input.userId,
      dishKey,
      title: input.title,
      explanation: input.explanation || '',
      ingredients: input.ingredients || [],
      recipe: input.recipe,
      nutritionSummary: input.nutritionSummary || '',
      favorite: Boolean(input.favorite),
      source: input.source || 'plan',
    });
  } else {
    if (input.explanation) doc.explanation = input.explanation;
    if (input.ingredients?.length) doc.ingredients = input.ingredients;
    if (input.recipe) doc.recipe = input.recipe;
    if (input.nutritionSummary) doc.nutritionSummary = input.nutritionSummary;
    if (input.favorite) doc.favorite = true;
    if (input.source) doc.source = input.source;
  }

  if (input.cooked) {
    doc.cookedCount += 1;
    doc.lastCookedAt = new Date();
  }
  if (input.rating) doc.rating = input.rating;
  if (input.photoDataUrl?.startsWith('data:image/')) {
    doc.photos.unshift({ dataUrl: input.photoDataUrl, at: new Date() });
    doc.photos = doc.photos.slice(0, 12);
  }

  await doc.save();
  return doc;
}
