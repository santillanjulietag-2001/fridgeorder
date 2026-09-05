import mongoose, { Schema, Types } from 'mongoose';

export interface IRecipePhoto {
  dataUrl: string;
  at: Date;
}

export interface ISavedRecipeBody {
  servings: number;
  steps: string[];
  prepMinutes?: number;
  cookMinutes?: number;
  totalMinutes?: number;
  difficulty?: string;
  tools: string[];
  tips: string[];
  pantryIngredientNames: string[];
  missingIngredientNames: string[];
}

export interface ISavedRecipe {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  dishKey: string;
  title: string;
  explanation: string;
  ingredients: string[];
  recipe?: ISavedRecipeBody;
  nutritionSummary: string;
  favorite: boolean;
  cookedCount: number;
  lastCookedAt?: Date;
  rating?: number;
  photos: IRecipePhoto[];
  source: 'plan' | 'daily';
  createdAt: Date;
  updatedAt: Date;
}

const photoSchema = new Schema<IRecipePhoto>(
  {
    dataUrl: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

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

const savedRecipeSchema = new Schema<ISavedRecipe>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dishKey: { type: String, required: true, index: true },
    title: { type: String, required: true },
    explanation: { type: String, default: '' },
    ingredients: [{ type: String }],
    recipe: bodySchema,
    nutritionSummary: { type: String, default: '' },
    favorite: { type: Boolean, default: false },
    cookedCount: { type: Number, default: 0 },
    lastCookedAt: Date,
    rating: Number,
    photos: [photoSchema],
    source: { type: String, default: 'plan' },
  },
  { timestamps: true }
);

savedRecipeSchema.index({ userId: 1, dishKey: 1 }, { unique: true });

export const SavedRecipe = mongoose.model<ISavedRecipe>('SavedRecipe', savedRecipeSchema);
