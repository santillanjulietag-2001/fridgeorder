import mongoose, { Schema, Types } from 'mongoose';
import type { MealSlot, MealStatus, MealRating } from '@fridgeorder/shared';

/** Optional recipe payload — filled in a later Meal Plan iteration */
export interface IMealRecipe {
  servings: number;
  steps: string[];
  prepMinutes?: number;
  cookMinutes?: number;
  totalMinutes?: number;
  difficulty?: 'facil' | 'media' | 'dificil';
  tools: string[];
  substitutions: string[];
  tips: string[];
  fridgeDays?: number;
  freezable: boolean;
  freezeNotes: string;
  thawNotes: string;
  reheatNotes: string;
  imageUrl: string;
  pantryIngredientNames: string[];
  missingIngredientNames: string[];
}

export interface IMealNutritionNote {
  summary: string;
  protein?: string;
  vegetables?: string;
  carbs?: string;
  fats?: string;
  fiber?: string;
}

export interface IMeal {
  _id: Types.ObjectId;
  day: string;
  slot: MealSlot;
  title: string;
  ingredients: string[];
  usesPantryIds: Types.ObjectId[];
  /** Lifecycle — see MEAL_STATUSES in shared */
  status: MealStatus;
  /** ISO date originally assigned (YYYY-MM-DD) */
  originalDate?: string;
  /** ISO date currently scheduled (may move across days/weeks) */
  scheduledDate?: string;
  weekStart: string;
  portions: number;
  rating?: MealRating;
  rejectReason?: string;
  replacedByTitle?: string;
  recipe?: IMealRecipe;
  nutritionNote?: IMealNutritionNote;
  prepIds: Types.ObjectId[];
}

export interface IMealPrep {
  _id: Types.ObjectId;
  title: string;
  whenLabel: string;
  durationMinutes?: number;
  usedByMealIds: Types.ObjectId[];
  portions?: number;
  fridgeDays?: number;
  freezable: boolean;
  storageNotes: string;
  ingredients: string[];
}

export interface IMealPlan {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  householdId?: Types.ObjectId;
  weekStart: string;
  meals: IMeal[];
  /** Anticipated batch/prep items for this week (future) */
  preps: IMealPrep[];
  generatedFromTripId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const recipeSchema = new Schema<IMealRecipe>(
  {
    servings: { type: Number, default: 2 },
    steps: [{ type: String }],
    prepMinutes: Number,
    cookMinutes: Number,
    totalMinutes: Number,
    difficulty: { type: String },
    tools: [{ type: String }],
    substitutions: [{ type: String }],
    tips: [{ type: String }],
    fridgeDays: Number,
    freezable: { type: Boolean, default: false },
    freezeNotes: { type: String, default: '' },
    thawNotes: { type: String, default: '' },
    reheatNotes: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    pantryIngredientNames: [{ type: String }],
    missingIngredientNames: [{ type: String }],
  },
  { _id: false }
);

const nutritionNoteSchema = new Schema<IMealNutritionNote>(
  {
    summary: { type: String, default: '' },
    protein: String,
    vegetables: String,
    carbs: String,
    fats: String,
    fiber: String,
  },
  { _id: false }
);

const mealSchema = new Schema<IMeal>({
  day: { type: String, required: true },
  slot: { type: String, required: true },
  title: { type: String, required: true },
  ingredients: [{ type: String }],
  usesPantryIds: [{ type: Schema.Types.ObjectId, ref: 'PantryItem' }],
  status: { type: String, default: 'planned', index: true },
  originalDate: String,
  scheduledDate: String,
  weekStart: { type: String, default: '' },
  portions: { type: Number, default: 2 },
  rating: String,
  rejectReason: String,
  replacedByTitle: String,
  recipe: recipeSchema,
  nutritionNote: nutritionNoteSchema,
  prepIds: [{ type: Schema.Types.ObjectId }],
});

const prepSchema = new Schema<IMealPrep>({
  title: { type: String, required: true },
  whenLabel: { type: String, default: '' },
  durationMinutes: Number,
  usedByMealIds: [{ type: Schema.Types.ObjectId }],
  portions: Number,
  fridgeDays: Number,
  freezable: { type: Boolean, default: false },
  storageNotes: { type: String, default: '' },
  ingredients: [{ type: String }],
});

const mealPlanSchema = new Schema<IMealPlan>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    householdId: { type: Schema.Types.ObjectId, ref: 'Household' },
    weekStart: { type: String, required: true, index: true },
    meals: [mealSchema],
    preps: [prepSchema],
    generatedFromTripId: { type: Schema.Types.ObjectId, ref: 'ShoppingTrip' },
  },
  { timestamps: true }
);

export const MealPlan = mongoose.model<IMealPlan>('MealPlan', mealPlanSchema);
