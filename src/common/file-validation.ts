import { BadRequestException } from '@nestjs/common';
import { readFileSync, unlinkSync } from 'fs';

// Client-supplied mimetype is trivially spoofable — check actual file bytes instead.
const SIGNATURES: Record<string, (buf: Buffer) => boolean> = {
  jpeg: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  png: (buf) =>
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a,
  webp: (buf) =>
    buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP',
};

// Multer already wrote the file to disk via diskStorage by the time a controller sees it —
// read back the first few bytes and delete it if they don't match a real image format.
export function assertValidImageFile(filePath: string): void {
  const buf = readFileSync(filePath).subarray(0, 12);
  const matchesAny = Object.values(SIGNATURES).some((check) => check(buf));
  if (!matchesAny) {
    try {
      unlinkSync(filePath);
    } catch {
      // best-effort cleanup
    }
    throw new BadRequestException('File content does not match an allowed image format (JPEG, PNG, WEBP)');
  }
}
