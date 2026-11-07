import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const storage = await mkdtemp(join(tmpdir(), 'bara-snapshot-test-'));
process.env.WITNESS_STORAGE_DIR = storage;
const app = await NestFactory.create(AppModule, { logger: false });
try {
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()) + '/witness/snapshots';
  const metadata = { schemaVersion: 1, sessionId: 'test-session', sequence: 1,
    capturedAt: new Date().toISOString(), frame: { width: 640, height: 480 }, location: null, orientation: null };
  async function send(data, image = true) {
    const body = new FormData();
    body.append('metadata', typeof data === 'string' ? data : JSON.stringify(data));
    if (image) body.append('image', new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' }), 'snapshot.jpg');
    return fetch(url, { method: 'POST', body });
  }
  const response = await send(metadata);
  assert.equal(response.status, 201);
  const receipt = await response.json();
  assert.equal(receipt.sequence, 1);
  const saved = JSON.parse(await readFile(join(storage, receipt.snapshotId, 'metadata.json'), 'utf8'));
  assert.equal(saved.sessionId, metadata.sessionId);
  assert.equal(saved.location, null);
  assert.equal((await readFile(join(storage, receipt.snapshotId, 'image.jpg'))).length, 4);
  assert.equal((await send('broken JSON')).status, 400);
  assert.equal((await send(metadata, false)).status, 400);
  assert.equal((await send({ ...metadata, sequence: -1 })).status, 400);
  assert.equal((await send({ ...metadata, frame: { width: 0, height: 480 } })).status, 400);
  console.log('Snapshot integration checks passed: receipt, persistence, optional sensors, invalid metadata, missing image.');
} finally {
  await app.close();
  await rm(storage, { recursive: true, force: true });
}
