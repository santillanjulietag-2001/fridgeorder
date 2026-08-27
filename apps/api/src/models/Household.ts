import mongoose, { Schema, Types } from 'mongoose';

export interface IHousehold {
  _id: Types.ObjectId;
  name: string;
  ownerId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const householdSchema = new Schema<IHousehold>(
  {
    name: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    inviteCode: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

export const Household = mongoose.model<IHousehold>('Household', householdSchema);
