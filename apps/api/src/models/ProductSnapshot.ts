import mongoose, { Schema, Types } from 'mongoose';
import type { Store } from '@fridgeorder/shared';

export interface IProductSnapshot {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  store: Store;
  storeUrl: string;
  title: string;
  brand: string;
  price?: number;
  unitPrice: string;
  imageUrl: string;
  rawHtmlDigest: string;
  capturedAt: Date;
}

const productSnapshotSchema = new Schema<IProductSnapshot>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  store: { type: String, required: true },
  storeUrl: { type: String, required: true },
  title: { type: String, required: true },
  brand: { type: String, default: '' },
  price: { type: Number },
  unitPrice: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  rawHtmlDigest: { type: String, default: '' },
  capturedAt: { type: Date, default: Date.now },
});

export const ProductSnapshot = mongoose.model<IProductSnapshot>('ProductSnapshot', productSnapshotSchema);
