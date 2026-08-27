import { z } from 'zod';

export const CATEGORIES = [
  'carne',
  'lacteos',
  'frutas',
  'verduras',
  'panaderia',
  'bebidas',
  'limpieza',
  'higiene',
  'congelados',
  'despensa',
  'otros',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  carne: 'Carne y pescado',
  lacteos: 'Lácteos',
  frutas: 'Frutas',
  verduras: 'Verduras',
  panaderia: 'Panadería',
  bebidas: 'Bebidas',
  limpieza: 'Limpieza',
  higiene: 'Higiene',
  congelados: 'Congelados',
  despensa: 'Despensa',
  otros: 'Otros',
};

/** Suggested aisle order for Spanish supers */
export const CATEGORY_ORDER: Category[] = [
  'frutas',
  'verduras',
  'panaderia',
  'carne',
  'lacteos',
  'congelados',
  'despensa',
  'bebidas',
  'higiene',
  'limpieza',
  'otros',
];

export const STORES = ['mercadona', 'bonarea', 'lidl', 'carrefour', 'dia', 'other'] as const;
export type Store = (typeof STORES)[number];

export const STORE_LABELS: Record<Store, string> = {
  mercadona: 'Mercadona',
  bonarea: 'BonÀrea',
  lidl: 'Lidl',
  carrefour: 'Carrefour',
  dia: 'Dia',
  other: 'Otro',
};

export const NEED_STATUSES = ['needed', 'selected', 'bought', 'consumed'] as const;
export type NeedStatus = (typeof NEED_STATUSES)[number];

export const PRICE_SOURCES = ['manual', 'scraped', 'ai_avg'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const NEED_SOURCES = ['manual', 'voice', 'extension'] as const;
export type NeedSource = (typeof NEED_SOURCES)[number];

export const TRIP_STATUSES = ['planned', 'in_progress', 'completed'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/** Meal slot within a day */
export const MEAL_SLOTS = ['desayuno', 'comida', 'cena'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/**
 * Lifecycle of a planned meal — reserved for flexible calendar / Tinder / batch cooking.
 * Current generator only uses `proposed` | `planned`.
 */
export const MEAL_STATUSES = [
  'proposed',
  'accepted',
  'rejected',
  'planned',
  'prepared',
  'consumed',
  'postponed',
  'saved_for_next_week',
  'replaced',
  'frozen',
  'leftover',
] as const;
export type MealStatus = (typeof MEAL_STATUSES)[number];

export const MEAL_RATINGS = [
  'like',
  'dislike',
  'maybe',
  'tried',
  'want_to_try',
  'never_again',
  'like_with_changes',
] as const;
export type MealRating = (typeof MEAL_RATINGS)[number];

export const NUTRITION_GOALS = [
  'balanced',
  'lose_weight',
  'maintain',
  'gain_muscle',
  'save_money',
  'cook_faster',
  'use_food_better',
  'reduce_waste',
  'more_variety',
] as const;
export type NutritionGoal = (typeof NUTRITION_GOALS)[number];

export const DIET_STYLES = [
  'general',
  'mediterranean',
  'vegetarian',
  'vegan',
  'high_protein',
  'low_carb',
  'gluten_free',
  'lactose_free',
  'other',
] as const;
export type DietStyle = (typeof DIET_STYLES)[number];

export const categorySchema = z.enum(CATEGORIES);
export const storeSchema = z.enum(STORES);

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(80),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const settingsSchema = z.object({
  splashImageUrl: z.string().url().or(z.literal('')).optional(),
  locale: z.string().optional(),
  currency: z.string().optional(),
  peopleCount: z.number().int().min(1).max(20).optional(),
  dietaryNotes: z.string().max(500).optional(),
});

export const needCreateSchema = z.object({
  name: z.string().min(1).max(200),
  category: categorySchema.optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
  preferredStore: storeSchema.optional(),
  estimatedPrice: z.number().nonnegative().optional(),
  priceSource: z.enum(PRICE_SOURCES).optional(),
  source: z.enum(NEED_SOURCES).optional(),
  householdId: z.string().optional(),
});

export const needUpdateSchema = needCreateSchema.partial().extend({
  status: z.enum(NEED_STATUSES).optional(),
});

export const productSearchSchema = z.object({
  query: z.string().min(1).max(200),
});

export const spokenListSchema = z.object({
  transcript: z.string().min(1).max(4000),
});

export const suggestBasicNeedsSchema = z.object({
  count: z.number().int().min(4).max(16).optional(),
});

export const suggestContextSchema = z.object({
  context: z.string().min(3).max(2000),
  count: z.number().int().min(4).max(20).optional(),
});

export const identifyProductImageSchema = z.object({
  imageDataUrl: z
    .string()
    .min(32)
    .max(6_000_000)
    .refine((v) => v.startsWith('data:image/'), 'Debe ser data URL de imagen'),
});

export const pickProductSchema = z.object({
  store: storeSchema,
  title: z.string().min(1),
  brand: z.string().optional(),
  price: z.number().nonnegative().optional(),
  unitPrice: z.string().optional(),
  imageUrl: z.string().optional(),
  storeUrl: z.string().optional(),
  category: categorySchema.optional(),
  quantity: z.number().positive().optional(),
  householdId: z.string().optional(),
  sourceHint: z.enum(['live', 'ai']).optional(),
});

export const ingestProductSchema = z.object({
  store: storeSchema,
  storeUrl: z.string().url(),
  title: z.string().min(1),
  brand: z.string().optional(),
  price: z.number().nonnegative().optional(),
  unitPrice: z.string().optional(),
  imageUrl: z.string().optional(),
  rawText: z.string().max(8000).optional(),
  quantity: z.number().positive().optional(),
  category: categorySchema.optional(),
  householdId: z.string().optional(),
});

export const createTripSchema = z.object({
  needIds: z.array(z.string()).min(1),
  householdId: z.string().optional(),
});

export const tripItemPatchSchema = z.object({
  itemId: z.string(),
  actualQty: z.number().nonnegative().optional(),
  actualPrice: z.number().nonnegative().optional(),
  purchased: z.boolean().optional(),
  voiceNote: z.string().optional(),
});

export const voiceParseSchema = z.object({
  transcript: z.string().min(1),
  tripId: z.string(),
});

export const pantryUpdateSchema = z.object({
  quantityOnHand: z.number().nonnegative().optional(),
  consumed: z.number().nonnegative().optional(),
  notes: z.string().max(300).optional(),
});

export const mealGenerateSchema = z.object({
  weekStart: z.string().optional(),
  peopleCount: z.number().int().min(1).max(20).optional(),
  dietaryNotes: z.string().max(500).optional(),
  householdId: z.string().optional(),
  includeRecipes: z.boolean().optional(),
  includeBatch: z.boolean().optional(),
});

export const mealPreferencesSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  goals: z.array(z.enum(NUTRITION_GOALS)).optional(),
  dietStyle: z.enum(DIET_STYLES).optional(),
  adults: z.number().int().min(0).max(20).optional(),
  children: z.number().int().min(0).max(20).optional(),
  portions: z.number().int().min(1).max(30).optional(),
  restrictions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  forbiddenIngredients: z.array(z.string()).optional(),
  cookDays: z.array(z.string()).optional(),
  cookTimeMinutes: z.number().int().min(5).max(480).optional(),
  weeklyBudgetEur: z.number().nonnegative().optional(),
  dislikedIngredients: z.array(z.string()).optional(),
  favoriteIngredients: z.array(z.string()).optional(),
  preferredCuisines: z.array(z.string()).optional(),
  avoidedTextures: z.array(z.string()).optional(),
  spiceLevel: z.number().int().min(0).max(5).optional(),
  preferQuickMeals: z.boolean().optional(),
  preferTraditional: z.boolean().optional(),
  neverSuggestDishKeys: z.array(z.string()).optional(),
  members: z
    .array(
      z.object({
        name: z.string().min(1),
        goals: z.array(z.enum(NUTRITION_GOALS)).optional(),
        dietStyle: z.enum(DIET_STYLES).optional(),
        allergies: z.array(z.string()).optional(),
        dislikedIngredients: z.array(z.string()).optional(),
        favoriteIngredients: z.array(z.string()).optional(),
        preferredCuisines: z.array(z.string()).optional(),
        avoidedTextures: z.array(z.string()).optional(),
        spiceLevel: z.number().int().min(0).max(5).optional(),
        preferQuickMeals: z.boolean().optional(),
        preferTraditional: z.boolean().optional(),
      })
    )
    .optional(),
  disclaimerAccepted: z.boolean().optional(),
});

export const mealSwipeSchema = z.object({
  dishKey: z.string().min(1),
  title: z.string().min(1),
  rating: z.enum(MEAL_RATINGS),
  notes: z.string().max(300).optional(),
});

export const mealActionSchema = z.object({
  action: z.enum([
    'move_day',
    'save_next_week',
    'postpone',
    'replace',
    'ate_other',
    'set_status',
    'clear_day',
    'accept',
    'reject',
  ]),
  targetDay: z.string().optional(),
  targetSlot: z.enum(MEAL_SLOTS).optional(),
  targetWeekStart: z.string().optional(),
  newTitle: z.string().optional(),
  status: z.enum(MEAL_STATUSES).optional(),
  rejectReason: z.string().max(300).optional(),
  ateOtherTitle: z.string().optional(),
});

export const recipeOptionsSchema = z.object({
  mode: z.enum(['full', 'faster', 'cheaper', 'pantry_fit', 'regenerate']).optional(),
  servings: z.number().int().min(1).max(20).optional(),
  replaceIngredient: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional(),
});

export const householdCreateSchema = z.object({
  name: z.string().min(1).max(80),
});

export const householdJoinSchema = z.object({
  inviteCode: z.string().min(4).max(32),
});

export function guessCategory(name: string): Category {
  const n = name.toLowerCase();
  const rules: [RegExp, Category][] = [
    [/yogur|leche|queso|mantequilla|nata|huevo/, 'lacteos'],
    [/pollo|ternera|cerdo|carne|jam[oó]n|pescado|salm[oó]n|at[uú]n|chorizo/, 'carne'],
    [/manzana|pl[aá]tano|naranja|fresa|uva|kiwi|lim[oó]n|fruta/, 'frutas'],
    [/tomate|lechuga|cebolla|patata|zanahoria|pimiento|verdura|espinaca/, 'verduras'],
    [/pan|baguette|boll[oó]|croissant/, 'panaderia'],
    [/agua|refresco|zumo|cerveza|vino|caf[eé]|t[eé]/, 'bebidas'],
    [/detergente|lej[ií]a|limpi|esponja|bolsa basura/, 'limpieza'],
    [/champ[uú]|jab[oó]n|pasta dental|papel higi[eé]nico|gel/, 'higiene'],
    [/congelado|helado|pizza congel/, 'congelados'],
    [/arroz|pasta|aceite|sal|az[uú]car|harina|lenteja|garbanzo|conserva/, 'despensa'],
  ];
  for (const [re, cat] of rules) {
    if (re.test(n)) return cat;
  }
  return 'otros';
}

export function groupByCategory<T extends { category: Category }>(items: T[]): Record<Category, T[]> {
  const groups = Object.fromEntries(CATEGORIES.map((c) => [c, [] as T[]])) as Record<Category, T[]>;
  for (const item of items) {
    groups[item.category]?.push(item);
  }
  return groups;
}
