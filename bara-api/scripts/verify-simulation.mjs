import assert from 'node:assert/strict';
import mongoose from 'mongoose';
const batch = process.argv[2] ?? 'bara-demo-v1';
const base = process.env.API_TEST_URL ?? 'http://api:3000';
const proxy = process.env.DASHBOARD_TEST_URL ?? 'http://bara-intelligence-intelligence-1:3000/api';
async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
try {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const run = await db.collection('simulation_runs').findOne({ _id: batch });
  assert.equal(run.status, 'completed');
  const sessions = await db.collection('sessions').find({ simulationBatchId: batch, synthetic: true }).toArray();
  assert.equal(sessions.length, run.sessions);
  const rows = await read(`${base}/sessions`);
  const dashboardRows = await read(`${proxy}/sessions`);
  let count = 0;
  const distribution = {};
  for (const session of sessions) {
    const summary = rows.find(s => s.id === String(session._id));
    assert.equal(summary.snapshotCount, run.config.captures);
    assert.equal(dashboardRows.find(s => s.id === summary.id).snapshotCount, summary.snapshotCount);
    assert.equal(summary.status, 'ended');
    const captures = await read(`${base}/sessions/${session._id}/snapshots`);
    assert.equal(captures.length, run.config.captures);
    assert.deepEqual(captures.map(s => s.time), captures.map(s => s.time).sort());
    for (const capture of captures) {
      assert.match(capture.analysisMessage, /SIMULATED DATA/);
      assert.equal(capture.followUp.scope, 'snapshot');
      assert.ok(capture.analyses.length > 0);
      for (const analysis of capture.analyses) {
        const counts = distribution[analysis.criterionKey] ??= {};
        const classification = analysis.status === 'completed' ? analysis.result.classification : 'unavailable';
        counts[classification] = (counts[classification] ?? 0) + 1;
      }
    }
    count += captures.length;
  }
  assert.equal(count, run.observations);
  const snapshot = await db.collection('snapshots').findOne({ simulationBatchId: batch });
  const image = await fetch(`${proxy}/snapshots/${snapshot._id}/image`, { signal: AbortSignal.timeout(15000) });
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/png/);
  assert.ok(Buffer.from(await image.arrayBuffer()).includes(Buffer.from('SYNTHETIC SIMULATION')));
  console.log(JSON.stringify({ batch, sessions: sessions.length, snapshots: count, apiAndDashboardVerified: true, mediaVerified: true, distribution }));
} finally { await mongoose.disconnect(); }
