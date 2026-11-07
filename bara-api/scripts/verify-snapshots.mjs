import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
const base = process.env.API_TEST_URL ?? 'http://bara-api-api-1:3000';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=', 'base64');
const metadata = { time: '2026-11-07T10:00:00+07:00', location: { latitude: -6.2, longitude: 106.8 }, direction: 90 };
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
await mongoose.connect(process.env.MONGODB_URI);
const sessions = [], snapshots = [], keys = [];
async function start() {
  const response = await fetch(`${base}/sessions`, { method: 'POST' });
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  sessions.push(new mongoose.Types.ObjectId(result.data.id));
  assert.equal(result.data.status, 'active'); return result.data.id;
}
function upload(input) {
  const form = new FormData();
  form.append('metadata', JSON.stringify(input));
  form.append('image', new Blob([image], { type: 'image/png' }), 'test.png');
  return fetch(`${base}/snapshots`, { method: 'POST', body: form });
}
async function capture(sessionId) {
  const response = await upload({ ...metadata, sessionId });
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  snapshots.push(new mongoose.Types.ObjectId(result.data.id));
  const key = result.data.imagePath.replace('s3://bara-media/', ''); keys.push(key);
  assert.equal(result.message, 'waiting for instruction');
  assert.equal(result.data.sessionId, sessionId);
  assert.ok(key.startsWith(`sessions/${sessionId}/snapshots/`));
  const saved = await mongoose.connection.db.collection('snapshots').findOne({ _id: snapshots.at(-1) });
  assert.equal(saved.sessionId.toString(), sessionId);
  assert.deepEqual(saved.location.coordinates, [106.8, -6.2]);
  const object = await s3.send(new GetObjectCommand({ Bucket: 'bara-media', Key: key }));
  assert.deepEqual(Buffer.from(await object.Body.transformToByteArray()), image);
}
try {
  const first = await start(); const second = await start();
  await capture(first); await capture(first); await capture(second);
  assert.equal(await mongoose.connection.db.collection('snapshots').countDocuments({ sessionId: sessions[0] }), 2);
  assert.equal(await mongoose.connection.db.collection('snapshots').countDocuments({ sessionId: sessions[1] }), 1);
  console.log('Two sessions started; 2 + 1 snapshots correctly grouped in MongoDB and MinIO; waiting message verified.');
  const restored = await fetch(`${base}/sessions/${first}`);
  assert.equal((await restored.json()).data.status, 'active');
  const end = await fetch(`${base}/sessions/${first}/end`, { method: 'POST' });
  assert.equal(end.status, 200);
  const ended = (await end.json()).data;
  assert.equal(ended.status, 'ended'); assert.ok(ended.endedAt);
  const repeated = await fetch(`${base}/sessions/${first}/end`, { method: 'POST' });
  assert.equal((await repeated.json()).data.endedAt, ended.endedAt);
  assert.equal((await upload({ ...metadata, sessionId: first })).status, 409);
  assert.equal((await upload(metadata)).status, 400);
  assert.equal((await upload({ ...metadata, sessionId: new mongoose.Types.ObjectId().toString() })).status, 404);
  assert.equal(await mongoose.connection.db.collection('snapshots').countDocuments({ sessionId: sessions[0] }), 2);
  console.log('Session restore/end verified; ended, missing and unknown sessions rejected without creating snapshots.');
} finally {
  for (const key of keys) await s3.send(new DeleteObjectCommand({ Bucket: 'bara-media', Key: key }));
  await mongoose.connection.db.collection('snapshots').deleteMany({ _id: { $in: snapshots } });
  await mongoose.connection.db.collection('sessions').deleteMany({ _id: { $in: sessions } });
  await mongoose.disconnect(); s3.destroy();
}
