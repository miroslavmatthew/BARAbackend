import mongoose from 'mongoose';
import { readFile } from 'node:fs/promises';
import { EVIDENCE_POLICY } from '../src/snapshots/evidence-policy.ts';

// Run with Node 24. Append policy without replacing custom prompts or schemas.
// Default is a preview; --apply retains history and checks each stored version.
const apply = process.argv.includes('--apply');
const definitions = JSON.parse(await readFile(new URL('./analysis-criteria.json', import.meta.url), 'utf8'));
await mongoose.connect(process.env.MONGODB_URI);
try {
  const collection = mongoose.connection.db.collection('analysis_criteria');
  for (const definition of definitions) {
    const previous = await collection.findOne({ key: definition.key });
    if (!previous) { console.log(`${definition.key}: missing; seed first`); continue; }
    if (previous.prompt.includes(EVIDENCE_POLICY)) { console.log(`${definition.key}: already updated`); continue; }
    const clarification = definition.prompt.split('\n\nUncertainty handling:\n')[1];
    const prompt = `${previous.prompt}\n\nUncertainty handling:\n${clarification}\n\n${EVIDENCE_POLICY}`;
    if (!apply) { console.log(`${definition.key}: would update version ${previous.version} -> ${previous.version + 1}`); continue; }
    const { _id, history, ...revision } = previous;
    const result = await collection.updateOne({ _id, version: previous.version }, {
      $set: { prompt, updatedAt: new Date() }, $inc: { version: 1 }, $push: { history: revision },
    });
    if (!result.modifiedCount) throw new Error(`Concurrent edit for ${definition.key}; rerun after reviewing it.`);
    console.log(`${definition.key}: updated to version ${previous.version + 1}`);
  }
} finally { await mongoose.disconnect(); }
