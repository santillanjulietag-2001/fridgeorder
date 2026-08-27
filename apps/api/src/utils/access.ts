import type { Types } from 'mongoose';
import { Household } from '../models/Household.js';

/** Build query filter for user-owned or shared household docs */
export async function ownershipFilter(userId: string, householdId?: string) {
  if (householdId) {
    const hh = await Household.findOne({
      _id: householdId,
      memberIds: userId,
    });
    if (!hh) return null;
    return { householdId: hh._id };
  }
  return { userId };
}

export function productKeyFromName(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function randomInviteCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function toId(id: Types.ObjectId | string) {
  return id.toString();
}
