// Integration check in isolated, uniquely named collections. No image-model calls.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { SessionSchema } from '../dist/snapshots/session.schema.js';
import { SnapshotSchema } from '../dist/snapshots/snapshot.schema.js';
import { SessionsService } from '../dist/snapshots/sessions.service.js';

const prefix = `checklist_validation_${randomUUID().replaceAll('-', '')}`;
const collections = [`${prefix}_sessions`, `${prefix}_snapshots`];
await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false });
const sessions = mongoose.model('ChecklistValidationSession', SessionSchema, collections[0]);
const snapshots = mongoose.model('ChecklistValidationSnapshot', SnapshotSchema, collections[1]);
const service = new SessionsService(sessions, snapshots);
const originalFetch = globalThis.fetch;
let modelCalls = 0;
process.env.OPENAI_API_KEY = 'synthetic-test-key';
globalThis.fetch = async () => {
  modelCalls++;
  return Response.json({ status: 'completed', model: 'synthetic-test', output: [{ content: [{ type: 'output_text', text: JSON.stringify({
    gapId: 'visible_flames.classification', witnessMessage: 'Can you photograph the area where you see fire?', reason: 'Flame evidence is unresolved.',
  }) }] }] });
};
try {
  const session = await sessions.create({});
  const add = async (classification, minute) => snapshots.create({ sessionId: session._id,
    time: new Date(`2026-11-07T10:0${minute}:00Z`), analyzedAt: new Date(),
    location: { type: 'Point', coordinates: [106.8, -6.2] }, direction: 90, imagePath: `synthetic://${prefix}/${minute}`,
    analyses: [{ criterionKey: 'visible_flames', criterionName: 'Visible flames', criterionVersion: 3,
      status: classification ? 'completed' : 'unavailable', ...(classification ? { result: { classification } } : {}) }],
  });
  await add('UNCERTAIN', 0);
  const first = await service.updateChecklist(session.id);
  assert.equal(first.instruction.status, 'ready');
  assert.equal(first.revision, 1);
  assert.equal((await sessions.findById(session.id)).instruction.gapId, 'visible_flames.classification');
  const clearFrame = await add('VISIBLE', 1);
  const second = await service.updateChecklist(session.id);
  assert.equal(second.instruction.status, 'not_needed');
  assert.equal(second.checklist.gaps.length, 0);
  await add(undefined, 2);
  const third = await service.updateChecklist(session.id);
  assert.equal(third.checklist.items[0].known.classification.snapshotId, clearFrame.id);
  assert.equal(third.checklist.snapshotIds.length, 3);
  assert.equal(modelCalls, 1, 'Resolved evidence must not be asked for again');
  const restored = await service.get(session.id);
  assert.equal(restored.data.checklistRevision, 3);
  assert.equal(restored.data.checklist.items[0].known.classification.value, 'VISIBLE');
  const guidedSession = await sessions.create({});
  for (let index = 1; index <= 6; index++) {
    const clear = index === 6;
    await snapshots.create({ sessionId: guidedSession._id, time: new Date(`2026-11-07T11:0${index}:00Z`), analyzedAt: new Date(),
      location: { type: 'Point', coordinates: [106.8, -6.2] }, direction: 90, imagePath: `synthetic://${prefix}/guided-${index}`,
      analyses: [{ criterionKey: 'visible_flames', criterionName: 'Visible flames', criterionVersion: 3, status: 'completed', result: { classification: 'VISIBLE' } }],
      captureQuality: { status: 'completed', assessments: { visible_flames: { status: clear ? 'CLEAR' : 'BLURRY', framing: 'NONE', evidence: clear ? 'Flame edges are clear.' : 'Flame edges are blurred.' } } },
    });
    // A fresh service instance proves progress comes from persisted state.
    const guided = await new SessionsService(sessions, snapshots).updateChecklist(guidedSession.id);
    const saved = await sessions.findById(guidedSession.id);
    assert.equal(saved.captureAttempts[0].attempts, Math.min(index, 5));
    if (index < 5) {
      assert.equal(guided.instruction.mode, 'capture_guidance');
      assert.equal(guided.instruction.attempt, index);
      assert.equal(guided.checklist.verificationStatus, 'incomplete');
    } else if (index === 5) {
      assert.equal(guided.instruction.status, 'not_needed');
      assert.deepEqual(guided.checklist.deferredCriteria, ['visible_flames']);
      assert.equal(guided.checklist.verificationStatus, 'incomplete');
    } else {
      assert.equal(guided.checklist.verificationStatus, 'complete');
      assert.deepEqual(guided.checklist.deferredCriteria, []);
    }
  }
  assert.equal(modelCalls, 1, 'Guided capture must use short deterministic instructions rather than extra generation calls');
  console.log('Session integration passed: evidence persistence, guided capture across service restarts, five failed frames defer without verification, later clear frame resolves. Model and quality responses were simulated.');
} finally {
  globalThis.fetch = originalFetch;
  for (const name of collections) {
    try { await mongoose.connection.dropCollection(name); }
    catch (error) { if (error.codeName !== 'NamespaceNotFound') throw error; }
  }
  await mongoose.disconnect();
}
