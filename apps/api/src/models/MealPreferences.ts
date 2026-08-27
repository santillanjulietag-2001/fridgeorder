import mongoose, { Schema, Types } from 'mongoose';
import type { DietStyle, MealRating, NutritionGoal } from '@fridgeorder/shared';

/**
 * Preferences for future Meal Plan features (questionnaire, Tinder swipes, household members).
 * Not exposed in UI yet — schema reserved so the first flow does not need a breaking migration.
 */
export interface IDishSwipe {
  dishKey: string;
  title: string;
  rating: MealRating;
  notes: string;
  at: Date;
}

export interface IHouseholdMemberPrefs {
  name: string;
  goals: NutritionGoal[];
  dietStyle: DietStyle;
  allergies: string[];
  dislikedIngredients: string[];
  favoriteIngredients: string[];
  preferredCuisines: string[];
  avoidedTextures: string[];
  spiceLevel: number;
  preferQuickMeals: boolean;
  preferTraditional: boolean;
}

export interface IMealPreferences {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  householdId?: Types.ObjectId;
  onboardingCompleted: boolean;
  goals: NutritionGoal[];
  dietStyle: DietStyle;
  adults: number;
  children: number;
  portions: number;
  restrictions: string[];
  allergies: string[];
  forbiddenIngredients: string[];
  cookDays: string[];
  cookTimeMinutes: number;
  weeklyBudgetEur?: number;
  dislikedIngredients: string[];
  favoriteIngredients: string[];
  preferredCuisines: string[];
  avoidedTextures: string[];
  spiceLevel: number;
  preferQuickMeals: boolean;
  preferTraditional: boolean;
  neverSuggestDishKeys: string[];
  swipes: IDishSwipe[];
  members: IHouseholdMemberPrefs[];
  disclaimerAccepted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const swipeSchema = new Schema<IDishSwipe>(
  {
    dishKey: { type: String, required: true },
    title: { type: String, required: true },
    rating: { type: String, required: true },
    notes: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const memberSchema = new Schema<IHouseholdMemberPrefs>(
  {
    name: { type: String, required: true },
    goals: [{ type: String }],
    dietStyle: { type: String, default: 'general' },
    allergies: [{ type: String }],
    dislikedIngredients: [{ type: String }],
    favoriteIngredients: [{ type: String }],
    preferredCuisines: [{ type: String }],
    avoidedTextures: [{ type: String }],
    spiceLevel: { type: Number, default: 1 },
    preferQuickMeals: { type: Boolean, default: true },
    preferTraditional: { type: Boolean, default: true },
  },
  { _id: false }
);

const mealPreferencesSchema = new Schema<IMealPreferences>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    householdId: { type: Schema.Types.ObjectId, ref: 'Household' },
    onboardingCompleted: { type: Boolean, default: false },
    goals: [{ type: String }],
    dietStyle: { type: String, default: 'general' },
    adults: { type: Number, default: 2 },
    children: { type: Number, default: 0 },
    portions: { type: Number, default: 2 },
    restrictions: [{ type: String }],
    allergies: [{ type: String }],
    forbiddenIngredients: [{ type: String }],
    cookDays: [{ type: String }],
    cookTimeMinutes: { type: Number, default: 45 },
    weeklyBudgetEur: Number,
    dislikedIngredients: [{ type: String }],
    favoriteIngredients: [{ type: String }],
    preferredCuisines: [{ type: String }],
    avoidedTextures: [{ type: String }],
    spiceLevel: { type: Number, default: 1 },
    preferQuickMeals: { type: Boolean, default: true },
    preferTraditional: { type: Boolean, default: true },
    neverSuggestDishKeys: [{ type: String }],
    swipes: [swipeSchema],
    members: [memberSchema],
    disclaimerAccepted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const MealPreferences = mongoose.model<IMealPreferences>(
  'MealPreferences',
  mealPreferencesSchema
);
