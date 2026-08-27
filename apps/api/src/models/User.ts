import mongoose, { Schema, Types } from 'mongoose';

export interface IUserSettings {
  splashImageUrl: string;
  locale: string;
  currency: string;
  peopleCount: number;
  dietaryNotes: string;
}

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  settings: IUserSettings;
  householdIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    settings: {
      splashImageUrl: { type: String, default: '' },
      locale: { type: String, default: 'es-ES' },
      currency: { type: String, default: 'EUR' },
      peopleCount: { type: Number, default: 2 },
      dietaryNotes: { type: String, default: '' },
    },
    householdIds: [{ type: Schema.Types.ObjectId, ref: 'Household' }],
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
