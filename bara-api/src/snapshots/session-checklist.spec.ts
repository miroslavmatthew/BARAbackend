import { buildSessionChecklist, type EvidenceSnapshot } from './session-checklist.js';

const snapshot = (id: string, key: string, result?: Record<string, unknown>): EvidenceSnapshot => ({ id, time: `2026-11-07T10:00:0${id}.000Z`, analyses: [{
  criterionKey: key, criterionName: key, criterionVersion: 3, status: result ? 'completed' : 'unavailable', ...(result ? { result } : {}),
}] });

describe('accumulated session checklist', () => {
  it('resolves earlier uncertainty and does not regress when a later image is unclear or unavailable', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'visible_flames', { classification: 'UNCERTAIN' }),
      snapshot('2', 'visible_flames', { classification: 'VISIBLE', visualEvidence: 'Flames on ground' }),
      snapshot('3', 'visible_flames', { classification: 'UNCERTAIN' }),
      snapshot('4', 'visible_flames'),
    ]);
    expect(checklist.gaps).toEqual([]);
    expect(checklist.items[0]!.known.classification).toMatchObject({ value: 'VISIBLE', snapshotId: '2' });
    expect(checklist.items[0]!.observations).toHaveLength(3);
    expect(checklist.items[0]!.unavailableSnapshotIds).toEqual(['4']);
  });
  it('fills independent smoke fields across images without discarding resolved color', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'smoke_visibility_color_origin', { classification: 'VISIBLE', smokeCategory: 'GRAY', apparentOrigin: 'OBSCURED' }),
      snapshot('2', 'smoke_visibility_color_origin', { classification: 'VISIBLE', smokeCategory: 'UNCERTAIN', apparentOrigin: 'VISIBLE' }),
    ]);
    expect(checklist.gaps).toEqual([]);
    expect(checklist.items[0]!.known.smokeCategory!.snapshotId).toBe('1');
    expect(checklist.items[0]!.known.apparentOrigin!.snapshotId).toBe('2');
  });
  it('retains frame-local absence without cancelling a prior positive sighting', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'visible_flames', { classification: 'VISIBLE' }),
      snapshot('2', 'visible_flames', { classification: 'NOT_VISIBLE' }),
    ]);
    expect(checklist.items[0]!.known.classification!.value).toBe('VISIBLE');
    expect(checklist.items[0]!.observations[1]!.result.classification).toBe('NOT_VISIBLE');
  });
  it('does not let an earlier negative answer a later unassessable view', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'visible_flames', { classification: 'NOT_VISIBLE' }),
      snapshot('2', 'visible_flames', { classification: 'UNCERTAIN' }),
    ]);
    expect(checklist.gaps[0]!.id).toBe('visible_flames.classification');
  });
  it.each([
    ['visible_flames', 'NOT_VISIBLE'],
    ['forest_woodland_fire', 'NO_VISIBLE_FOREST_FIRE'],
    ['fire_suppression', 'NOT_VISIBLE'],
    ['smoke_visibility_color_origin', 'NOT_VISIBLE'],
    ['visibly_burning_material', 'NO_VISIBLE_BURNING'],
  ])('keeps %s incomplete when it has only a frame-local negative', (key, classification) => {
    const checklist = buildSessionChecklist([snapshot('1', key, { classification })]);
    expect(checklist.verificationStatus).toBe('incomplete');
    expect(checklist.items[0]!.status).toBe('uncertain');
    expect(checklist.items[0]!.known.classification).toBeUndefined();
    expect(checklist.items[0]!.observations[0]!.result.classification).toBe(classification);
    expect(checklist.gaps.map(gap => gap.id)).toEqual([`${key}.classification`]);
  });
  it('does not reuse distance from another camera frame', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'camera_to_fire_distance', { classification: 'ESTIMABLE', target: 'VISIBLE_FIRE', relativeDepth: 'BACKGROUND' }),
      snapshot('2', 'camera_to_fire_distance', { classification: 'NOT_DETERMINABLE', target: 'NOT_LOCATABLE', relativeDepth: 'UNCERTAIN' }),
    ]);
    expect(checklist.items[0]!.scope).toBe('current_snapshot');
    expect(checklist.items[0]!.known).toEqual({});
    expect(checklist.gaps.map(gap => gap.field)).toContain('classification');
  });
  it('does not assign an earlier known actor role to an unknown person in a new frame', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'fire_suppression', { classification: 'VISIBLE', actors: [{ role: 'FIREFIGHTER' }] }),
      snapshot('2', 'fire_suppression', { classification: 'VISIBLE', actors: [{ role: 'PERSON_ROLE_UNKNOWN' }] }),
    ]);
    expect(checklist.gaps.map(gap => gap.id)).toEqual(['fire_suppression.actors']);
  });
  it('accumulates different identified materials and their source images', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'visibly_burning_material', { classification: 'IDENTIFIABLE', burningMaterials: [{ category: 'TREES' }, { category: 'UNKNOWN' }] }),
      snapshot('2', 'visibly_burning_material', { classification: 'IDENTIFIABLE', burningMaterials: [{ category: 'GRASS' }] }),
    ]);
    expect(checklist.items[0]!.known.burningMaterials!.value).toEqual([{ category: 'TREES' }, { category: 'GRASS' }]);
    expect(checklist.items[0]!.known.burningMaterials!.sources!.map(source => source.snapshotId)).toEqual(['1', '2']);
  });
  it('does not erase an unresolved actor role when the next frame cannot show any actor', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'fire_suppression', { classification: 'VISIBLE', actors: [{ role: 'PERSON_ROLE_UNKNOWN' }] }),
      snapshot('2', 'fire_suppression', { classification: 'UNCERTAIN', actors: [] }),
    ]);
    expect(checklist.gaps.map(gap => gap.id)).toEqual(['fire_suppression.actors']);
  });
  it('retains different observations rather than silently overwriting history', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'smoke_visibility_color_origin', { classification: 'VISIBLE', smokeCategory: 'WHITE', apparentOrigin: 'VISIBLE' }),
      snapshot('2', 'smoke_visibility_color_origin', { classification: 'VISIBLE', smokeCategory: 'BLACK', apparentOrigin: 'VISIBLE' }),
    ]);
    expect(checklist.items[0]!.observations.map(o => o.result.smokeCategory)).toEqual(['WHITE', 'BLACK']);
    expect(checklist.items[0]!.known.smokeCategory!.value).toBe('BLACK');
  });
  it('does not turn technical failures or peat uncertainty into witness photo requests', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'visible_flames'),
      snapshot('2', 'visibly_burning_material', { classification: 'IDENTIFIABLE', burningMaterials: [{ category: 'TREES' }], peatInvolvement: 'UNCONFIRMED' }),
    ]);
    expect(checklist.items[0]!.status).toBe('unavailable');
    expect(checklist.verificationStatus).toBe('incomplete');
    expect(checklist.gaps).toEqual([]);
    expect(buildSessionChecklist([]).items).toEqual([]);
  });
  it('keeps verification incomplete and requests a measured reference when distance fails for a visible fire', () => {
    const earlier = snapshot('1', 'camera_to_fire_distance', { classification: 'NOT_DETERMINABLE', target: 'NOT_LOCATABLE', relativeDepth: 'UNCERTAIN' });
    const current = snapshot('2', 'visible_flames', { classification: 'VISIBLE' });
    current.analyses!.push(...snapshot('2', 'camera_to_fire_distance').analyses!);
    const checklist = buildSessionChecklist([earlier, current]);
    expect(checklist.verificationStatus).toBe('incomplete');
    expect(checklist.items.find(item => item.criterionKey === 'camera_to_fire_distance')!.status).toBe('unavailable');
    expect(checklist.gaps.map(gap => gap.id)).toEqual(['camera_to_fire_distance.measuredReference']);
    expect(checklist.summary).toContain('1 unavailable');
  });
  it('does not request distance to a source only seen in an earlier frame', () => {
    const checklist = buildSessionChecklist([
      snapshot('1', 'visible_flames', { classification: 'VISIBLE' }),
      snapshot('2', 'camera_to_fire_distance'),
    ]);
    expect(checklist.verificationStatus).toBe('incomplete');
    expect(checklist.gaps).toEqual([]);
  });
});
