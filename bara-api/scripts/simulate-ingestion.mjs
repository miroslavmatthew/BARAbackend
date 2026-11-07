import mongoose from 'mongoose';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { setTimeout as delay } from 'node:timers/promises';
import { generate, fixturePng, id } from './simulation-data.mjs';

const options = Object.fromEntries(process.argv.slice(2).map(arg => {
  if (!/^--[a-z-]+(?:=.*)?$/.test(arg)) throw new Error('Use --option=value.');
  const index = arg.indexOf('='); return index < 0 ? [arg.slice(2), true] : [arg.slice(2, index), arg.slice(index + 1)];
}));
const allowed = ['batch', 'seed', 'sessions', 'captures', 'start', 'interval-seconds', 'speed', 'mode', 'write', 'cleanup', 'refresh-results'];
for (const key of Object.keys(options)) if (!allowed.includes(key)) throw new Error(`Unknown option: ${key}`);
const batch = options.batch ?? 'bara-demo-v1';
if (typeof batch !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(batch)) throw new Error('Invalid batch name.');
const mode = options.mode ?? 'batch';
if (!['batch', 'replay'].includes(mode)) throw new Error('Mode must be batch or replay.');
const speed = Number(options.speed ?? 60);
if (!Number.isFinite(speed) || speed <= 0) throw new Error('Speed must be positive.');
const config = { seed: options.seed ?? batch, sessions: Number(options.sessions ?? 100), captures: Number(options.captures ?? 12), intervalSeconds: Number(options['interval-seconds'] ?? 60), start: options.start ?? new Date(Date.now() - (mode === 'batch' ? 3600000 : 0)).toISOString() };
let dataset = generate(config);
const summary = { batch, mode, sessions: dataset.sessions.length, observations: dataset.snapshots.length, scenarios: dataset.incidents.length, config };
if (!options.write) { console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2)); process.exit(0); }
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000', region: process.env.S3_REGION ?? 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }, requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 } });
const bucket = process.env.S3_BUCKET ?? 'bara-media';
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const runs = db.collection('simulation_runs');
  const marker = { simulationBatchId: batch, synthetic: true };
  if (options.cleanup) {
    const run = await runs.findOne({ _id: batch });
    if (!run) throw new Error('Batch does not exist; cleanup refused.');
    let continuation;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `simulations/${batch}/`, ContinuationToken: continuation }));
      if (page.Contents?.length) {
        const result = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: page.Contents.map(item => ({ Key: item.Key })) } }));
        if (result.Errors?.length) throw new Error('Media cleanup incomplete; rerun cleanup.');
      }
      continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuation);
    for (const collection of ['snapshots', 'sessions', 'simulation_incidents']) await db.collection(collection).deleteMany(marker);
    await runs.deleteOne({ _id: batch });
    console.log(JSON.stringify({ batch, cleaned: true }));
  } else {
    if (options['refresh-results']) {
      const run = await runs.findOne({ _id: batch, status: 'completed', synthetic: true });
      if (!run) throw new Error('A completed synthetic batch is required to refresh results.');
      Object.assign(config, run.config);
      dataset = generate(config);
      const count = await db.collection('snapshots').countDocuments(marker);
      if (count !== dataset.snapshots.length) throw new Error('Existing batch count differs; refresh refused.');
    }
    const criteria = await db.collection('analysis_criteria').find({ active: { $ne: false } }).sort({ order: 1 }).toArray();
    if (!criteria.length) throw new Error('No active analysis criteria; seed criteria before simulation.');
    // Validate every generated result against the current stored schema before writing.
    function validate(value, schema) {
      if (schema.enum && !schema.enum.includes(value)) return false;
      if (schema.type === 'string') return typeof value === 'string' && value.length > 0;
      if (schema.type === 'array') return Array.isArray(value) && value.every(item => validate(item, schema.items));
      if (schema.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value) && (schema.required ?? []).every(k => k in value) && Object.keys(value).every(k => schema.properties[k] ? validate(value[k], schema.properties[k]) : schema.additionalProperties !== false);
      return false;
    }
    const { buildAnalysisFollowUp } = await import('../dist/snapshots/analysis-follow-up.js');
    for (const row of dataset.snapshots) {
      row.analyses = criteria.map(criterion => {
        const base = { criterionKey: criterion.key, criterionName: criterion.name, criterionVersion: criterion.version };
        const result = row.results[criterion.key];
        if (!result || row.simulation.unavailable || row.simulation.unavailableCriteria?.includes(criterion.key)) return { ...base, status: 'unavailable', message: 'SIMULATED: analysis unavailable; no classification made.' };
        if (!validate(result, criterion.expectedResult.jsonSchema)) throw new Error(`Generated result is incompatible with current criterion: ${criterion.key}`);
        for (const rule of criterion.expectedResult.consistencyRules ?? []) if (Object.entries(rule.when).every(([k, v]) => result[k] === v) && !Object.entries(rule.require).every(([k, v]) => result[k] === v)) throw new Error(`Generated result violates consistency rule: ${criterion.key}`);
        return { ...base, status: 'completed', result, model: 'synthetic-fixture', message: `SIMULATED ${criterion.name}\n${JSON.stringify(result)}` };
      });
      delete row.results;
      row.followUp = buildAnalysisFollowUp(row.analyses);
      // Snapshot schema requires a unique media path. Each observation gets its own object.
    }
    // Reserve the batch. Reusing it is rejected, including after an interrupted run.
    if (!options['refresh-results']) await runs.insertOne({ _id: batch, ...summary, status: 'loading', synthetic: true, createdAt: new Date() });
    const objectId = value => new mongoose.Types.ObjectId(value);
    const toDocument = row => ({ ...row, ...marker, _id: objectId(row._id), ...(row.incidentId ? { incidentId: objectId(row.incidentId) } : {}), ...(row.sessionId ? { sessionId: objectId(row.sessionId) } : {}) });
    const png = fixturePng();
    // IDs include the batch as well as seed so separate batches never collide.
    const scoped = new Map([...dataset.incidents, ...dataset.sessions, ...dataset.snapshots].map(row => [row._id, id(`${batch}:${row._id}`)]));
    for (const row of [...dataset.incidents, ...dataset.sessions, ...dataset.snapshots]) {
      row._id = scoped.get(row._id);
      if (row.incidentId) row.incidentId = scoped.get(row.incidentId);
      if (row.sessionId) row.sessionId = scoped.get(row.sessionId);
      if (row.sessionId) row.imagePath = `s3://${bucket}/simulations/${batch}/${row._id}.png`;
    }
    if (options['refresh-results']) {
      const result = await db.collection('snapshots').bulkWrite(dataset.snapshots.map(row => ({ updateOne: {
        filter: { _id: objectId(row._id), ...marker },
        update: { $set: { analyses: row.analyses, followUp: row.followUp, simulation: row.simulation, analysisMessage: row.analysisMessage } },
      } })));
      if (result.matchedCount !== dataset.snapshots.length) throw new Error('Refresh did not match every generated observation.');
      await runs.updateOne({ _id: batch }, { $set: { resultsRefreshedAt: new Date(), resultGeneratorVersion: 3 } });
      console.log(JSON.stringify({ batch, refreshed: result.matchedCount }));
    } else {
    await db.collection('simulation_incidents').insertMany(dataset.incidents.map(toDocument));
    if (mode === 'batch') await db.collection('sessions').insertMany(dataset.sessions.map(toDocument));
    const begun = new Set();
    const clock = Date.now();
    const firstTime = dataset.snapshots[0].createdAt.getTime();
    let loaded = 0;
    for (const row of dataset.snapshots) {
      if (mode === 'replay') {
        await delay(Math.max(0, (row.createdAt.getTime() - firstTime) / speed - (Date.now() - clock)));
        if (!begun.has(row.sessionId)) {
          const session = dataset.sessions.find(s => s._id === row.sessionId);
          await db.collection('sessions').insertOne(toDocument({ ...session, status: 'active', endedAt: null }));
          begun.add(row.sessionId);
        }
      }
      const mediaKey = `simulations/${batch}/${row._id}.png`;
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: mediaKey, Body: png, ContentType: 'image/png' }));
      await db.collection('snapshots').insertOne(toDocument(row));
      if (++loaded % 200 === 0) console.log(JSON.stringify({ batch, loaded }));
    }
    if (mode === 'replay') for (const session of dataset.sessions) await db.collection('sessions').updateOne({ _id: objectId(session._id), ...marker }, { $set: { status: 'ended', endedAt: session.endedAt } });
    const actual = await db.collection('snapshots').countDocuments(marker);
    if (actual !== dataset.snapshots.length) throw new Error('Snapshot count verification failed.');
    await runs.updateOne({ _id: batch }, { $set: { status: 'completed', completedAt: new Date(), loaded: actual } });
    console.log(JSON.stringify({ ...summary, verified: true }));
    }
  }
} finally { await mongoose.disconnect(); s3.destroy(); }
