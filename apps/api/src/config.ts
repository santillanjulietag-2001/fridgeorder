import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4200),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fridgeorder',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me-32chars',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me-32chars',
  accessTtl: '15m',
  refreshTtl: '30d',
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5180',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
};
