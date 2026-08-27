import mongoose, { Schema, Types } from 'mongoose';
import type { Category, NeedSource, NeedStatus, PriceSource, Store } from '@fridgeorder/shared';

export interface INeedItem {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  householdId?: Types.ObjectId;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  notes: string;
  preferredStore: Store;
  estimatedPrice?: number;
  priceSource: PriceSource;
  status: NeedStatus;
  source: NeedSource;
  brand: string;
  unitPrice: string;
  imageUrl: string;
  storeUrl: string;
  productSnapshotId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const needItemSchema = new Schema<INeedItem>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    householdId: { type: Schema.Types.ObjectId, ref: 'Household', index: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unit: { type: String, default: 'ud' },
    notes: { type: String, default: '' },
    preferredStore: { type: String, default: 'other' },
    estimatedPrice: { type: Number },
    priceSource: { type: String, default: 'manual' },
    status: { type: String, default: 'needed', index: true },
    source: { type: String, default: 'manual' },
    brand: { type: String, default: '' },
    unitPrice: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    storeUrl: { type: String, default: '' },
    productSnapshotId: { type: Schema.Types.ObjectId, ref: 'ProductSnapshot' },
  },
  { timestamps: true }
);

export const NeedItem = mongoose.model<INeedItem>('NeedItem', needItemSchema);
