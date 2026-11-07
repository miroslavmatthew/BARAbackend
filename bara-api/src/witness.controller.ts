import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';

@Controller('witness/snapshots')
export class WitnessController {
  @Post()
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 1, fieldSize: 64 * 1024 } }))
  async receive(@UploadedFile() image: { buffer: Buffer; mimetype: string } | undefined, @Body('metadata') raw: string) {
    if (!image || image.mimetype !== 'image/jpeg' || image.buffer[0] !== 0xff || image.buffer[1] !== 0xd8 || image.buffer[2] !== 0xff) {
      throw new BadRequestException('image must be a JPEG (maximum 8 MiB)');
    }
    let metadata: Record<string, unknown>;
    try { metadata = JSON.parse(raw); } catch { throw new BadRequestException('metadata must be JSON'); }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata.schemaVersion !== 1 ||
      typeof metadata.sessionId !== 'string' || !/^[\w-]{1,100}$/.test(metadata.sessionId) ||
      !Number.isSafeInteger(metadata.sequence) || (metadata.sequence as number) < 1 ||
      typeof metadata.capturedAt !== 'string' || !Number.isFinite(Date.parse(metadata.capturedAt))) {
      throw new BadRequestException('Invalid metadata: schemaVersion, sessionId, sequence and capturedAt are required');
    }
    const frame = metadata.frame as { width?: number; height?: number } | undefined;
    if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width! < 1 || frame.height! < 1) {
      throw new BadRequestException('frame width and height must be positive integers');
    }
    const snapshotId = randomUUID();
    const receivedAt = new Date().toISOString();
    const root = resolve(process.env.WITNESS_STORAGE_DIR ?? 'data/witness');
    const pending = join(root, `.${snapshotId}`);
    await mkdir(pending, { recursive: true });
    try {
      await writeFile(join(pending, 'image.jpg'), image.buffer);
      await writeFile(join(pending, 'metadata.json'), JSON.stringify({ ...metadata, snapshotId, receivedAt }, null, 2));
      await rename(pending, join(root, snapshotId));
    } catch (error) { await rm(pending, { recursive: true, force: true }); throw error; }
    return { snapshotId, receivedAt, sessionId: metadata.sessionId, sequence: metadata.sequence };
  }
}
