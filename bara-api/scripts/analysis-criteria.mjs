import mongoose from 'mongoose';
import { readFile } from 'node:fs/promises';

// seed | list | get <key> | update <key> <expected-version> <JSON-file>
await mongoose.connect(process.env.MONGODB_URI);
try {
  const collection = mongoose.connection.db.collection('analysis_criteria');
  await collection.createIndex({ key: 1 }, { unique: true });
  const [action = 'list', key, version, file] = process.argv.slice(2);
  if (action === 'seed') {
    const criteria = JSON.parse(await readFile(new URL('./analysis-criteria.json', import.meta.url), 'utf8'));
    for (const criterion of criteria) {
      await collection.updateOne({ key: criterion.key }, { $setOnInsert: { ...criterion, version: 1, createdAt: new Date(), updatedAt: new Date(), history: [] } }, { upsert: true });
    }
    console.log(JSON.stringify(await collection.find({}, { projection: { key: 1, name: 1, version: 1 } }).toArray(), null, 2));
  } else if (action === 'get' || action === 'list') {
    console.log(JSON.stringify(action === 'get' ? await collection.findOne({ key }) : await collection.find({}, { projection: { history: 0 } }).sort({ order: 1 }).toArray(), null, 2));
  } else if (action === 'update') {
    const patch = JSON.parse(await readFile(file, 'utf8'));
    const allowed = ['name', 'description', 'prompt', 'expectedResult', 'order', 'active'];
    if (!Object.keys(patch).length || Object.keys(patch).some(field => !allowed.includes(field))) throw new Error('Only name, description, prompt, expectedResult, order, and active may be updated.');
    const previous = await collection.findOne({ key, version: Number(version) });
    if (!previous) throw new Error('Criterion missing or version changed. Read it again before editing.');
    const next = { ...previous, ...patch };
    for (const field of ['name', 'description', 'prompt']) if (typeof next[field] !== 'string' || !next[field].trim()) throw new Error(`${field} must be non-empty text.`);
    if (!Number.isInteger(next.order) || next.order < 1) throw new Error('order must be a positive integer.');
    if (next.active !== undefined && typeof next.active !== 'boolean') throw new Error('active must be true or false.');
    const schema = next.expectedResult?.jsonSchema;
    if (schema?.type !== 'object' || schema.additionalProperties !== false || !Array.isArray(schema.required) || !schema.properties || !Array.isArray(schema.properties.classification?.enum) || !schema.properties.classification.enum.length) throw new Error('Expected result must contain an object JSON schema with classification choices.');
    const { _id, history, ...revision } = previous;
    const result = await collection.updateOne({ key, version: Number(version) }, { $set: { ...patch, updatedAt: new Date() }, $inc: { version: 1 }, $push: { history: revision } });
    if (!result.modifiedCount) throw new Error('Concurrent edit detected; nothing was overwritten.');
    console.log(JSON.stringify({ key, version: Number(version) + 1, updated: true }));
  } else throw new Error('Use seed, list, get, or update.');
} finally { await mongoose.disconnect(); }
