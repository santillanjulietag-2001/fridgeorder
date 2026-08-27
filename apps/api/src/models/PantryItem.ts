import mongoose, { Schema, Types } from 'mongoose';
import type { Category } from '@fridgeorder/shared';

export interface IPantryItem {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  householdId?: Types.ObjectId;
  productKey: string;
  name: string;
  category: Category;
  quantityOnHand: number;
  unit: string;
  lastBoughtAt?: Date;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const pantryItemSchema = new Schema<IPantryItem>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    householdId: { type: Schema.Types.ObjectId, ref: 'Household', index: true },
    productKey: { type: String, required: true, index: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    quantityOnHand: { type: Number, default: 0 },
    unit: { type: String, default: 'ud' },
    lastBoughtAt: { type: Date },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

pantryItemSchema.index({ userId: 1, productKey: 1 }, { unique: true });

export const PantryItem = mongoose.model<IPantryItem>('PantryItem', pantryItemSchema);
