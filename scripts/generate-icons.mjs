import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function png(size, rgb = [26, 77, 62]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      const cx = x - size / 2;
      const cy = y - size / 2;
      const inCircle = cx * cx + cy * cy < (size * 0.28) ** 2;
      if (inCircle) {
        raw[i] = 196;
        raw[i + 1] = 225;
        raw[i + 2] = 122;
        raw[i + 3] = 255;
      } else {
        raw[i] = rgb[0];
        raw[i + 1] = rgb[1];
        raw[i + 2] = rgb[2];
        raw[i + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const webPublic = join(root, 'apps/web/public');
const extIcons = join(root, 'apps/extension/icons');
mkdirSync(webPublic, { recursive: true });
mkdirSync(extIcons, { recursive: true });

writeFileSync(join(webPublic, 'pwa-192.png'), png(192));
writeFileSync(join(webPublic, 'pwa-512.png'), png(512));
writeFileSync(join(extIcons, 'icon16.png'), png(16));
writeFileSync(join(extIcons, 'icon48.png'), png(48));
writeFileSync(join(extIcons, 'icon128.png'), png(128));
console.log('Icons generated');
