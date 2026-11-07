import { planCaptureGuidance, type CaptureAttempt } from './capture-guidance.js';
import { buildSessionChecklist, type EvidenceSnapshot } from './session-checklist.js';
import type { SessionInstruction } from './session-instruction.js';

const frame = (id: string, status: 'CLEAR' | 'BLURRY' | 'CUT_OFF' | 'NOT_PRESENT' = 'BLURRY'): EvidenceSnapshot => ({
  id, time: '2026-11-07T10:00:00Z', analyses: [{ criterionKey: 'visible_flames', criterionName: 'Flames', criterionVersion: 1,
    status: 'completed', result: { classification: 'VISIBLE' } }],
  captureQuality: { status: 'completed', assessments: { visible_flames: { status, framing: status === 'CUT_OFF' ? 'LEFT' : 'NONE', evidence: 'Visible subject needs a clearer view.' } } },
});

describe('guided capture and evidence acceptance', () => {
  it('does not confirm blurry positive evidence, then resolves it when clear', () => {
    const blurry = buildSessionChecklist([frame('one')]);
    expect(blurry.verificationStatus).toBe('incomplete');
    expect(blurry.items[0]!.known.classification).toBeUndefined();
    const plan = planCaptureGuidance(blurry, 1, undefined);
    expect(plan.instruction).toMatchObject({ mode: 'capture_guidance', criterionKey: 'visible_flames', attempt: 1, witnessMessage: 'Hold the camera steady on the flames.' });
    const clear = buildSessionChecklist([frame('one'), frame('two', 'CLEAR')]);
    expect(clear.verificationStatus).toBe('complete');
    expect(clear.items[0]!.known.classification!.snapshotId).toBe('two');
    expect(planCaptureGuidance(clear, 2, plan.instruction, plan.attempts).instruction).toBeUndefined();
  });
  it('gives a short framing instruction from a supported visible crop', () => {
    const plan = planCaptureGuidance(buildSessionChecklist([frame('one', 'CUT_OFF')]), 1, undefined);
    expect(plan.instruction!.witnessMessage).toBe('Include the left side of the flames.');
  });
  it('defers after five deficient images without marking the subject verified', () => {
    let attempts: CaptureAttempt[] = [];
    let previous: SessionInstruction | undefined;
    const frames: EvidenceSnapshot[] = [];
    for (let index = 1; index <= 5; index++) {
      frames.push(frame(String(index)));
      const checklist = buildSessionChecklist(frames);
      const plan = planCaptureGuidance(checklist, index, previous, attempts);
      attempts = plan.attempts; previous = plan.instruction;
      expect(checklist.verificationStatus).toBe('incomplete');
      if (index < 5) expect(plan.instruction!.attempt).toBe(index);
      else {
        expect(plan.instruction).toBeUndefined();
        expect(plan.deferredCriterionKeys).toEqual(['visible_flames']);
        expect(attempts[0]!.attempts).toBe(5);
      }
    }
    const resolvedLater = buildSessionChecklist([...frames, frame('six', 'CLEAR')]);
    expect(resolvedLater.verificationStatus).toBe('complete');
    expect(planCaptureGuidance(resolvedLater, 6, undefined, attempts).deferredCriterionKeys).toEqual([]);
  });
  it('counts a frame only once across refreshes and optimistic retries', () => {
    const checklist = buildSessionChecklist([frame('one')]);
    const first = planCaptureGuidance(checklist, 1, undefined);
    const retry = planCaptureGuidance(checklist, 2, first.instruction, first.attempts);
    expect(retry.attempts[0]!.attempts).toBe(1);
  });
  it('moves to another subject after the cutoff', () => {
    const current = frame('five');
    current.analyses!.push({ criterionKey: 'forest_woodland_fire', criterionName: 'Forest', criterionVersion: 1, status: 'completed', result: { classification: 'UNCERTAIN' } });
    current.captureQuality!.assessments.forest_woodland_fire = { status: 'CUT_OFF', framing: 'WIDER', evidence: 'Vegetation is cropped.' };
    const plan = planCaptureGuidance(buildSessionChecklist([current]), 5,
      { status: 'ready', checklistRevision: 4, mode: 'capture_guidance', criterionKey: 'visible_flames' },
      [{ criterionKey: 'visible_flames', attempts: 4, lastSnapshotId: 'four', deferred: false }]);
    expect(plan.deferredCriterionKeys).toEqual(['visible_flames']);
    expect(plan.instruction).toMatchObject({ criterionKey: 'forest_woodland_fire', attempt: 1 });
  });
  it('never guides a missing subject or erases already accepted clear evidence', () => {
    const missing = frame('one', 'NOT_PRESENT');
    (missing.analyses![0] as { result: { classification: string } }).result.classification = 'NOT_VISIBLE';
    expect(planCaptureGuidance(buildSessionChecklist([missing]), 1, undefined).instruction).toBeUndefined();
    const clear = buildSessionChecklist([frame('one', 'CLEAR'), frame('two')]);
    expect(clear.items[0]!.known.classification!.snapshotId).toBe('one');
    expect(planCaptureGuidance(clear, 2, undefined).instruction).toBeUndefined();
  });
  it('leaves evidence unverified when quality assessment fails rather than inventing a camera instruction', () => {
    const unavailable = frame('one');
    unavailable.captureQuality = { status: 'unavailable', assessments: {} };
    const checklist = buildSessionChecklist([unavailable]);
    expect(checklist.items[0]!.status).toBe('unavailable');
    expect(checklist.verificationStatus).toBe('incomplete');
    expect(planCaptureGuidance(checklist, 1, undefined).instruction).toBeUndefined();
  });
  it('honors explicitly skipped requests', () => {
    const checklist = buildSessionChecklist([frame('one')]);
    expect(planCaptureGuidance(checklist, 1, undefined, [], ['visible_flames.captureQuality']).instruction).toBeUndefined();
  });
  it('does not accept a positive result when the quality assessment could not see its subject', () => {
    const checklist = buildSessionChecklist([frame('one', 'NOT_PRESENT')]);
    expect(checklist.verificationStatus).toBe('incomplete');
    expect(checklist.items[0]!.known.classification).toBeUndefined();
    expect(planCaptureGuidance(checklist, 1, undefined).instruction).toBeUndefined();
  });
});
