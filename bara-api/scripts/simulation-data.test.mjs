import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, fixturePng } from './simulation-data.mjs';

test('repeatable grouped observations maintain coordinates, headings and session chronology', () => {
  const data = generate();
  assert.deepEqual(data, generate());
  assert.equal(data.sessions.length, 100);
  assert.equal(data.snapshots.length, 1200);
  assert.equal(data.incidents.length, 20);
  assert.equal(new Set(data.snapshots.map(s => s._id)).size, 1200);
  for (const session of data.sessions) {
    const rows = data.snapshots.filter(row => row.sessionId === session._id);
    assert.equal(rows.length, 12);
    for (const row of rows) {
      assert.ok(row.time >= session.startedAt && row.time <= session.endedAt);
      assert.ok(row.direction >= 0 && row.direction < 360);
      assert.ok(Math.abs(row.location.coordinates[0]) <= 180 && Math.abs(row.location.coordinates[1]) <= 90);
      assert.notDeepEqual(row.location, data.incidents.find(i => i._id === row.incidentId).groundTruthOrigin);
    }
  }
  assert.deepEqual([...new Set(data.snapshots.map(s => s.simulation.phase))].sort(), ['active', 'monitoring', 'reported', 'suppression']);
  assert.ok(data.snapshots.some(s => s.simulation.unavailable));
  assert.ok(data.snapshots.some(s => s.simulation.clarity === 'obscured'));
  for (const row of data.snapshots.filter(s => s.simulation.phase === 'monitoring')) assert.equal(row.results.visible_flames.classification === 'VISIBLE', false);
});
test('limits reject invalid or excessive workloads before database access', () => {
  for (const config of [{ sessions: -1 }, { captures: 0 }, { sessions: 10000, captures: 1000 }, { start: 'bad' }, { intervalSeconds: NaN }]) assert.throws(() => generate(config));
  assert.equal(generate({ sessions: 1, captures: 1 }).snapshots.length, 1);
});
test('randomized observations cover flame/smoke combinations with consistent dependent results', () => {
  const rows = generate().snapshots;
  const combinations = new Set();
  const colors = new Set();
  for (const { results: r } of rows) {
    const flames = r.visible_flames.classification;
    const smoke = r.smoke_visibility_color_origin;
    combinations.add(`${flames}/${smoke.classification}`);
    if (smoke.classification === 'NOT_VISIBLE') {
      assert.equal(smoke.smokeCategory, 'NOT_APPLICABLE');
      assert.equal(smoke.apparentOrigin, 'NOT_APPLICABLE');
    }
    if (smoke.classification === 'UNCERTAIN') assert.equal(smoke.smokeCategory, 'UNCERTAIN');
    if (smoke.classification === 'VISIBLE') colors.add(smoke.smokeCategory);
    if (flames === 'VISIBLE') assert.notEqual(r.visibly_burning_material.classification, 'NO_VISIBLE_BURNING');
    if (r.camera_to_fire_distance.target === 'APPARENT_SMOKE_ORIGIN') {
      assert.equal(smoke.classification, 'VISIBLE');
      assert.equal(smoke.apparentOrigin, 'VISIBLE');
    }
  }
  for (const combination of ['VISIBLE/VISIBLE', 'VISIBLE/NOT_VISIBLE', 'NOT_VISIBLE/VISIBLE', 'NOT_VISIBLE/NOT_VISIBLE', 'UNCERTAIN/UNCERTAIN']) assert.ok(combinations.has(combination), combination);
  assert.equal(colors.size, 5);
  assert.notDeepEqual(rows.map(r => r.results), generate({ seed: 'different' }).snapshots.map(r => r.results));
});
test('materials, response actors, distance references and partial failures vary consistently', () => {
  const rows = generate().snapshots;
  const materials = new Set(), roles = new Set(), distances = new Set(), depths = new Set();
  for (const row of rows) {
    const r = row.results, material = r.visibly_burning_material, response = r.fire_suppression, distance = r.camera_to_fire_distance;
    material.burningMaterials.forEach(item => materials.add(item.category));
    response.actors.forEach(actor => roles.add(actor.role));
    distances.add(distance.classification);
    depths.add(distance.relativeDepth);
    if (material.classification === 'IDENTIFIABLE') assert.ok(material.burningMaterials.some(item => item.category !== 'UNKNOWN'));
    if (material.classification === 'NO_VISIBLE_BURNING') assert.equal(material.burningMaterials.length, 0);
    if (material.burningMaterials.some(item => item.category === 'UNKNOWN')) assert.equal(material.classification, 'UNCERTAIN');
    if (response.classification === 'NOT_VISIBLE') assert.ok(response.actors.every(actor => actor.role === 'NOT_APPLICABLE'));
    else assert.ok(response.actors.every(actor => actor.role !== 'NOT_APPLICABLE'));
    if (response.classification === 'VISIBLE') assert.ok(response.actors.length > 0);
    if (distance.classification === 'ESTIMABLE') {
      assert.ok(row.simulation.suppliedMappedTarget);
      assert.match(distance.evidenceAndLimitations, /supplied mapped target/);
      assert.match(distance.approximateDistance, /meters horizontal map distance/);
    } else assert.equal(distance.approximateDistance, 'not determinable');
    assert.equal(material.peatInvolvement, 'UNCONFIRMED');
  }
  assert.equal(materials.size, 7);
  assert.equal(roles.size, 6);
  assert.equal(distances.size, 3);
  assert.equal(depths.size, 4);
  assert.ok(rows.some(row => row.results.visibly_burning_material.burningMaterials.length > 1));
  assert.ok(rows.some(row => row.results.fire_suppression.actors.length > 1));
  assert.ok(rows.some(row => !row.simulation.unavailable && row.simulation.unavailableCriteria.length > 0 && row.simulation.unavailableCriteria.length < 6));
});
test('fixture is a labelled PNG rather than a claimed photograph', () => {
  const png = fixturePng();
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.includes(Buffer.from('SYNTHETIC SIMULATION PLACEHOLDER')));
});
