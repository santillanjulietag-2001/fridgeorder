import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { loginSchema, registerSchema } from '@fridgeorder/shared';
import { User } from '../models/User.js';
import {
  requireAuth,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AuthRequest,
} from '../middleware/auth.js';

export const authRouter = Router();

function publicUser(user: InstanceType<typeof User>) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    settings: user.settings,
    householdIds: user.householdIds.map((id) => id.toString()),
  };
}

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password, name } = parsed.data;
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ error: 'El email ya está registrado' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email: email.toLowerCase(), passwordHash, name });
  const accessToken = signAccessToken(user._id.toString());
  const refreshToken = signRefreshToken(user._id.toString());
  res.status(201).json({ user: publicUser(user), accessToken, refreshToken });
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  res.json({
    user: publicUser(user),
    accessToken: signAccessToken(user._id.toString()),
    refreshToken: signRefreshToken(user._id.toString()),
  });
});

authRouter.post('/refresh', async (req, res) => {
  const token = req.body?.refreshToken as string | undefined;
  if (!token) return res.status(400).json({ error: 'Falta refreshToken' });
  try {
    const payload = verifyRefreshToken(token);
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Token inválido' });
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    res.json({
      accessToken: signAccessToken(user._id.toString()),
      refreshToken: signRefreshToken(user._id.toString()),
      user: publicUser(user),
    });
  } catch {
    res.status(401).json({ error: 'Refresh inválido' });
  }
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  res.json({ user: publicUser(req.user!) });
});
