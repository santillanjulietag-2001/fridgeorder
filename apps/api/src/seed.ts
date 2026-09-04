import bcrypt from 'bcryptjs';
import { User } from './models/User.js';

const DEMO_EMAIL = 'demo@fridgeorder.local';
const DEMO_PASSWORD = 'secret123';

export async function ensureDemoUser() {
  const exists = await User.findOne({ email: DEMO_EMAIL });
  if (exists) return;

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await User.create({
    email: DEMO_EMAIL,
    passwordHash,
    name: 'Demo',
  });
  console.log(`Usuario demo creado: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}
