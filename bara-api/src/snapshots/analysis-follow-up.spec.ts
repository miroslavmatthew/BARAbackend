import { buildAnalysisFollowUp } from './analysis-follow-up.js';

const assessed = (criterionKey: string, result: Record<string, unknown>) => ({
  criterionKey, criterionName: criterionKey, criterionVersion: 1,
  status: 'completed', result, message: 'Evidence',
});

describe('general information follow-up', () => {
  it('preserves positive findings and groups source questions before material and response questions', () => {
    const followUp = buildAnalysisFollowUp([
      assessed('fire_suppression', { classification: 'UNCERTAIN', actors: [] }),
      assessed('forest_woodland_fire', { classification: 'UNCERTAIN' }),
      assessed('visible_flames', { classification: 'UNCERTAIN' }),
      assessed('smoke_visibility_color_origin', { classification: 'VISIBLE', smokeCategory: 'GRAY', apparentOrigin: 'OBSCURED' }),
    ]);
    expect(followUp.nextRequest?.criterionKeys).toEqual(['visible_flames', 'smoke_visibility_color_origin']);
    expect(followUp.prioritizedRequests.map(request => request.priority)).toEqual([1, 2, 3]);
    expect(followUp.summary).toContain('4/4 criteria assessed. 4 have unresolved details; 0 unavailable.');
    expect(followUp.findings[3]!.observations).toMatchObject({ classification: 'VISIBLE', smokeCategory: 'GRAY' });
    expect(followUp.nextRequest?.witnessMessage).not.toMatch(/move|closer|left|right|angle/i);
  });
  it('keeps unavailable analysis separate and does not ask the witness to fix a service failure', () => {
    const followUp = buildAnalysisFollowUp([{ criterionKey: 'visible_flames', criterionName: 'Flames', criterionVersion: 1, status: 'unavailable', message: 'Timed out' }]);
    expect(followUp.unavailableCriteria).toEqual(['visible_flames']);
    expect(followUp.findings[0]!.classification).toBeNull();
    expect(followUp.nextRequest).toBeNull();
  });
  it('requests evidence for a frame-local negative but not unconfirmed peat', () => {
    const followUp = buildAnalysisFollowUp([
      assessed('visible_flames', { classification: 'NOT_VISIBLE', limitations: 'UNCERTAIN is a label' }),
      assessed('visibly_burning_material', { classification: 'IDENTIFIABLE', peatInvolvement: 'UNCONFIRMED', burningMaterials: [{ category: 'TREES' }] }),
    ]);
    expect(followUp.nextRequest?.criterionKeys).toEqual(['visible_flames']);
    expect(followUp.prioritizedRequests).toHaveLength(1);
  });
  it('recognizes unresolved nested details and measured-distance needs despite a resolved top-level classification', () => {
    const followUp = buildAnalysisFollowUp([
      assessed('fire_suppression', { classification: 'VISIBLE', actors: [{ role: 'PERSON_ROLE_UNKNOWN' }] }),
      assessed('camera_to_fire_distance', { classification: 'RELATIVE_ONLY', relativeDepth: 'BACKGROUND' }),
    ]);
    expect(followUp.findings[0]!.unresolvedFields).toEqual(['actors[0].role']);
    expect(followUp.prioritizedRequests[1]!.witnessMessage).toContain('measured distance');
  });
  it('keeps unknown criteria reviewable without inventing a request', () => {
    const followUp = buildAnalysisFollowUp([assessed('new_criterion', { classification: 'UNCERTAIN' })]);
    expect(followUp.unsupportedCriteria).toEqual(['new_criterion']);
    expect(followUp.nextRequest).toBeNull();
    expect(buildAnalysisFollowUp([]).summary).toContain('No criterion results');
  });
});
