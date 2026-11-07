import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createInterface } from 'node:readline/promises';
const review = process.env.BROWSER_REVIEW === '1' ? createInterface({ input: process.stdin, output: process.stdout }) : null;
const base = process.env.API_TEST_URL ?? 'http://api:3000';
const proxy = process.env.DASHBOARD_TEST_URL ?? 'http://bara-intelligence-intelligence-1:3000/api';
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=', 'base64');
const sessionIds = [], snapshotIds = [], keys = [];
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
async function json(url, options) { const r = await fetch(url, options); assert.ok(r.ok, `${r.status}: ${await r.clone().text()}`); return (await r.json()).data; }
try {
  const first = await json(`${base}/sessions`, { method: 'POST' }); sessionIds.push(new mongoose.Types.ObjectId(first.id));
  const second = await json(`${base}/sessions`, { method: 'POST' }); sessionIds.push(new mongoose.Types.ObjectId(second.id));
  assert.deepEqual(await json(`${proxy}/sessions/${first.id}/snapshots`), []);
  if (review) await review.question(`BROWSER_EMPTY_SESSION=${first.id}\nPress Enter to add captures.\n`);
  for (const time of ['2026-11-07T03:02:00Z','2026-11-07T03:01:00Z','2026-11-07T03:01:00Z']) {
    const form = new FormData(); form.append('image', new Blob([png], { type: 'image/png' }), 'test.png');
    form.append('metadata', JSON.stringify({ sessionId: first.id, time, location: { latitude: -6.2, longitude: 106.8 }, direction: 90 }));
    const s = await json(`${base}/snapshots`, { method: 'POST', body: form });
    snapshotIds.push(new mongoose.Types.ObjectId(s.id)); keys.push(s.imagePath.replace('s3://bara-media/',''));
  }
  const rows = await json(`${proxy}/sessions`);
  assert.equal(rows.find(s => s.id === first.id).snapshotCount, 3);
  assert.equal(rows.find(s => s.id === second.id).snapshotCount, 0);
  assert.ok(rows.findIndex(s => s.id === second.id) < rows.findIndex(s => s.id === first.id));
  const captures = await json(`${proxy}/sessions/${first.id}/snapshots`);
  assert.equal(captures.length, 3);
  assert.deepEqual(captures.map(s => s.time), [...captures.map(s => s.time)].sort());
  assert.ok(captures[0].id < captures[1].id);
  assert.deepEqual(captures[0].location, { latitude: -6.2, longitude: 106.8 });
  const image = await fetch(`${proxy}${captures[0].imageUrl}`);
  assert.equal(image.status, 200); assert.match(image.headers.get('content-type'), /image\/png/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  const missing = new mongoose.Types.ObjectId().toString();
  for (const endpoint of ['sessions/bad','sessions/bad/snapshots','snapshots/bad/image']) assert.equal((await fetch(`${base}/${endpoint}`)).status,400);
  for (const endpoint of [`sessions/${missing}`,`sessions/${missing}/snapshots`,`snapshots/${missing}/image`]) assert.equal((await fetch(`${proxy}/${endpoint}`)).status,404);
  await s3.send(new DeleteObjectCommand({ Bucket: 'bara-media', Key: keys[0] }));
  assert.equal((await fetch(`${proxy}/snapshots/${snapshotIds[0]}/image`)).status,404);
  await json(`${base}/sessions/${first.id}/end`, { method: 'POST' });
  assert.equal((await json(`${proxy}/sessions`)).find(s => s.id === first.id).status,'ended');
  assert.equal((await fetch(`${proxy}/sessions`, { method: 'POST' })).status,405);
  assert.equal((await fetch(`${proxy}/unlisted`)).status,404);
  console.log('PASS: session counts/order; empty and populated timelines; stable time/ID ordering; coordinate conversion; private image bytes; invalid/missing IDs and images; ended sessions; read-only dashboard proxy.');
  if (review) await review.question('BROWSER_CAPTURES_READY. Press Enter after inspecting live refresh to remove the temporary fixtures.\n');
} finally {
  for (const key of keys) await s3.send(new DeleteObjectCommand({ Bucket: 'bara-media', Key: key }));
  await db.collection('snapshots').deleteMany({ _id: { $in: snapshotIds } });
  await db.collection('sessions').deleteMany({ _id: { $in: sessionIds } });
  await mongoose.disconnect(); s3.destroy(); review?.close();
}
