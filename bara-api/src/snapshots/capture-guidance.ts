import type { SessionChecklist } from './session-checklist.js';
import type { SessionInstruction } from './session-instruction.js';

export const CAPTURE_ATTEMPT_LIMIT = 5;
export interface CaptureAttempt {
  criterionKey: string;
  attempts: number;
  lastSnapshotId: string;
  deferred: boolean;
}

export function planCaptureGuidance(checklist: SessionChecklist, revision: number, previous: SessionInstruction | undefined,
  savedAttempts: CaptureAttempt[] = [], dismissedGapIds: string[] = []) {
  const attempts = savedAttempts.map(entry => ({ ...entry }));
  const latestId = checklist.latestSnapshotId;
  const issueFor = (key: string) => checklist.items.find(item => item.criterionKey === key)?.observations.find(o => o.snapshotId === latestId)?.captureAssessment;
  const failed = (key: string) => ['BLURRY', 'CUT_OFF'].includes(issueFor(key)?.status ?? '');
  const unresolved = (key: string) => checklist.gaps.some(gap => gap.criterionKey === key);
  // Count only submitted images for the subject currently being guided. No
  // increment on a refresh, CAS retry, model failure, or unrelated subject.
  const bump = (key: string) => {
    let entry = attempts.find(entry => entry.criterionKey === key);
    if (!entry) { entry = { criterionKey: key, attempts: 0, lastSnapshotId: '', deferred: false }; attempts.push(entry); }
    if (latestId && entry.lastSnapshotId !== latestId) {
      entry.attempts++;
      entry.lastSnapshotId = latestId;
      entry.deferred = entry.attempts >= CAPTURE_ATTEMPT_LIMIT;
    }
    return entry;
  };
  if (previous?.mode === 'capture_guidance' && previous.criterionKey && unresolved(previous.criterionKey) && failed(previous.criterionKey)) bump(previous.criterionKey);
  const deferredCriterionKeys = attempts.filter(entry => entry.deferred && unresolved(entry.criterionKey)).map(entry => entry.criterionKey);
  const eligible = checklist.gaps.filter(gap => gap.criterionKey !== 'camera_to_fire_distance' && !dismissedGapIds.includes(gap.id)
    && !deferredCriterionKeys.includes(gap.criterionKey) && failed(gap.criterionKey));
  const selected = eligible.find(gap => previous?.mode === 'capture_guidance' && gap.criterionKey === previous.criterionKey) ?? eligible[0];
  if (!selected) return { attempts, deferredCriterionKeys, instruction: undefined };
  const entry = bump(selected.criterionKey);
  if (entry.deferred) return { attempts, deferredCriterionKeys: [...new Set([...deferredCriterionKeys, selected.criterionKey])], instruction: undefined };
  const assessment = issueFor(selected.criterionKey)!;
  const subject = ({ visible_flames: 'flames', forest_woodland_fire: 'vegetation', fire_suppression: 'firefighting activity',
    smoke_visibility_color_origin: 'smoke', visibly_burning_material: 'burning material' } as Record<string, string>)[selected.criterionKey] ?? 'subject';
  const messages = {
    LEFT: `Include the left side of the ${subject}.`, RIGHT: `Include the right side of the ${subject}.`,
    TOP: `Include the top of the ${subject}.`, BOTTOM: `Include the bottom of the ${subject}.`,
    CENTER: `Center the ${subject} in the frame.`, WIDER: `Fit the ${subject} fully in the frame.`, NONE: `Fit the ${subject} fully in the frame.`,
  };
  const instruction: SessionInstruction = { status: 'ready', checklistRevision: revision, gapId: selected.id,
    criterionKey: selected.criterionKey, mode: 'capture_guidance', attempt: entry.attempts, attemptLimit: CAPTURE_ATTEMPT_LIMIT,
    witnessMessage: assessment.status === 'BLURRY' ? `Hold the camera steady on the ${subject}.` : messages[assessment.framing],
    reason: assessment.evidence };
  return { attempts, deferredCriterionKeys, instruction };
}
