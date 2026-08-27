import mongoose, { Schema, Types } from 'mongoose';
import type { Category, TripStatus } from '@fridgeorder/shared';

export interface ITripItem {
  _id: Types.ObjectId;
  needId: Types.ObjectId;
  name: string;
  category: Category;
  plannedQty: number;
  plannedPrice?: number;
  actualQty?: number;
  actualPrice?: number;
  purchased: boolean;
  unit: string;
}

export interface IShoppingTrip {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  householdId?: Types.ObjectId;
  selectedNeedIds: Types.ObjectId[];
  items: ITripItem[];
  plannedTotal: number;
  actualTotal: number;
  status: TripStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

const tripItemSchema = new Schema<ITripItem>({
  needId: { type: Schema.Types.ObjectId, ref: 'NeedItem', required: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  plannedQty: { type: Number, default: 1 },
  plannedPrice: { type: Number },
  actualQty: { type: Number },
  actualPrice: { type: Number },
  purchased: { type: Boolean, default: false },
  unit: { type: String, default: 'ud' },
});

const shoppingTripSchema = new Schema<IShoppingTrip>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    householdId: { type: Schema.Types.ObjectId, ref: 'Household' },
    selectedNeedIds: [{ type: Schema.Types.ObjectId, ref: 'NeedItem' }],
    items: [tripItemSchema],
    plannedTotal: { type: Number, default: 0 },
    actualTotal: { type: Number, default: 0 },
    status: { type: String, default: 'planned' },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export const ShoppingTrip = mongoose.model<IShoppingTrip>('ShoppingTrip', shoppingTripSchema);
