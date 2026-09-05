import mongoose, { Schema, Types } from 'mongoose';
import type { ISavedRecipeBody } from './SavedRecipe.js';

export interface IDailyRecipe {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  date: string;
  dishKey: string;
  title: string;
  explanation: string;
  ingredients: string[];
  recipe?: ISavedRecipeBody;
  nutritionSummary: string;
  createdAt: Date;
  updatedAt: Date;
}

const bodySchema = new Schema<ISavedRecipeBody>(
  {
    servings: { type: Number, default: 2 },
    steps: [{ type: String }],
    prepMinutes: Number,
    cookMinutes: Number,
    totalMinutes: Number,
    difficulty: String,
    tools: [{ type: String }],
    tips: [{ type: String }],
    pantryIngredientNames: [{ type: String }],
    missingIngredientNames: [{ type: String }],
  },
  { _id: false }
);

const dailyRecipeSchema = new Schema<IDailyRecipe>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true },
    dishKey: { type: String, required: true },
    title: { type: String, required: true },
    explanation: { type: String, default: '' },
    ingredients: [{ type: String }],
    recipe: bodySchema,
    nutritionSummary: { type: String, default: '' },
  },
  { timestamps: true }
);

dailyRecipeSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DailyRecipe = mongoose.model<IDailyRecipe>('DailyRecipe', dailyRecipeSchema);
