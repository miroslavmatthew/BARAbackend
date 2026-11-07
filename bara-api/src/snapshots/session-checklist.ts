import type { CaptureAssessment, CaptureQuality } from './capture-quality.js';

export interface EvidenceSnapshot {
  id: string;
  time: string;
  analyses?: unknown[];
  captureQuality?: CaptureQuality;
}
export interface Observation {
  snapshotId: string;
  capturedAt: string;
  criterionVersion: number;
  result: Record<string, unknown>;
  captureAssessment?: CaptureAssessment;
  qualityUnavailable?: boolean;
}
export interface ChecklistItem {
  criterionKey: string;
  criterionName: string;
  scope: 'session' | 'current_snapshot';
  status: 'resolved' | 'uncertain' | 'unavailable';
  known: Record<string, { value: unknown; snapshotId: string; capturedAt: string;
    sources?: { value: unknown; snapshotId: string; capturedAt: string }[] }>;
  unresolvedFields: string[];
  observations: Observation[];
  unavailableSnapshotIds: string[];
}
export interface SessionChecklist {
  scope: 'session';
  verificationStatus: 'complete' | 'incomplete';
  snapshotIds: string[];
  latestSnapshotId: string | null;
  items: ChecklistItem[];
  gaps: { id: string; criterionKey: string; field: string; priority: number }[];
  summary: string;
  deferredCriteria?: string[];
}

const uncertain = new Set(['UNCERTAIN', 'UNKNOWN', 'NOT_DETERMINABLE', 'NOT_LOCATABLE', 'RELATIVE_ONLY', 'OBSCURED', 'OUTSIDE_FRAME', 'PERSON_ROLE_UNKNOWN', 'OPERATOR_NOT_VISIBLE']);
const positive = new Set(['VISIBLE', 'FOREST_FIRE_VISIBLE', 'IDENTIFIABLE']);
const negative = new Set(['NOT_VISIBLE', 'NO_VISIBLE_FOREST_FIRE', 'NO_VISIBLE_BURNING']);
const priorities: Record<string, number> = { visible_flames: 1, smoke_visibility_color_origin: 1, forest_woodland_fire: 2, visibly_burning_material: 2, fire_suppression: 3, camera_to_fire_distance: 4 };
const semanticFields = ['classification', 'smokeCategory', 'apparentOrigin', 'burningMaterial', 'burningMaterials', 'actors', 'target', 'relativeDepth'];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function hasUncertainty(value: unknown): boolean {
  if (typeof value === 'string') return uncertain.has(value) || value === 'unknown';
  if (Array.isArray(value)) return value.some(hasUncertainty);
  return record(value) && Object.entries(value).some(([key, item]) => ['role', 'category'].includes(key) && hasUncertainty(item));
}

export function buildSessionChecklist(snapshots: EvidenceSnapshot[]): SessionChecklist {
  const items = new Map<string, ChecklistItem>();
  for (const snapshot of snapshots) {
    for (const analysis of snapshot.analyses ?? []) {
      if (!record(analysis) || typeof analysis.criterionKey !== 'string' || typeof analysis.criterionName !== 'string') continue;
      const key = analysis.criterionKey;
      let item = items.get(key);
      if (!item) {
        item = { criterionKey: key, criterionName: analysis.criterionName,
          scope: key === 'camera_to_fire_distance' ? 'current_snapshot' : 'session',
          status: 'unavailable', known: {}, unresolvedFields: [], observations: [], unavailableSnapshotIds: [] };
        items.set(key, item);
      }
      if (analysis.status === 'completed' && record(analysis.result)) {
        item.observations.push({ snapshotId: snapshot.id, capturedAt: snapshot.time,
          criterionVersion: typeof analysis.criterionVersion === 'number' ? analysis.criterionVersion : 0, result: analysis.result,
          ...(key !== 'camera_to_fire_distance' && snapshot.captureQuality ? {
            captureAssessment: snapshot.captureQuality.assessments[key],
            qualityUnavailable: snapshot.captureQuality.status === 'unavailable' || !snapshot.captureQuality.assessments[key],
          } : {}) });
      } else item.unavailableSnapshotIds.push(snapshot.id);
    }
  }
  const latestSnapshotId = snapshots.at(-1)?.id ?? null;
  for (const item of items.values()) {
    const scoped = item.scope === 'current_snapshot' ? item.observations.filter(o => o.snapshotId === latestSnapshotId) : item.observations;
    const observations = scoped.filter(o => !o.qualityUnavailable && (!o.captureAssessment || o.captureAssessment.status === 'CLEAR'
      || (o.captureAssessment.status === 'NOT_PRESENT' && !positive.has(String(o.result.classification)))));
    if (!observations.length) {
      const latest = scoped.at(-1);
      if (latest?.captureAssessment && ['BLURRY', 'CUT_OFF', 'UNKNOWN', 'NOT_PRESENT'].includes(latest.captureAssessment.status)) {
        item.status = 'uncertain';
        item.unresolvedFields.push(['BLURRY', 'CUT_OFF'].includes(latest.captureAssessment.status) ? 'captureQuality' : 'classification');
      }
      continue;
    }
    item.status = 'resolved';
    // A frame-local negative never cancels earlier positive evidence. Nor does it
    // resolve uncertainty in a later frame when there has been no positive sighting.
    const positives = observations.filter(o => positive.has(String(o.result.classification)));
    const classificationSource = positives.at(-1) ?? observations.at(-1)!;
    const source = (observation: Observation, field: string) => ({ value: observation.result[field], snapshotId: observation.snapshotId, capturedAt: observation.capturedAt });
    const classification = classificationSource.result.classification;
    if (typeof classification === 'string' && !hasUncertainty(classification) && !negative.has(classification)) item.known.classification = source(classificationSource, 'classification');
    else item.unresolvedFields.push('classification');
    const relevant = negative.has(String(classification)) ? [classificationSource] : observations.filter(o => !negative.has(String(o.result.classification)));
    for (const field of semanticFields.filter(field => field !== 'classification')) {
      let candidates = relevant.filter(o => field in o.result && o.result[field] !== 'NOT_APPLICABLE');
      // Never match different actors by array index across images. Actor roles
      // remain tied to their source frame; a known responder elsewhere is no proof.
      if (field === 'actors') candidates = candidates.filter(o => Array.isArray(o.result.actors) && o.result.actors.length > 0
        && !negative.has(String(o.result.classification))).slice(-1);
      if (!candidates.length) continue;
      if (field === 'burningMaterial' || field === 'burningMaterials') {
        const sources = candidates.flatMap(observation => {
          const value = observation.result[field];
          const supported = Array.isArray(value) ? value.filter(entry => !hasUncertainty(entry)) : [];
          return supported.length ? [{ ...source(observation, field), value: supported }] : [];
        });
        if (sources.length) {
          const materials = new Map<string, unknown>();
          for (const observation of sources) for (const material of observation.value) materials.set(record(material) ? String(material.category) : String(material), material);
          item.known[field] = { ...sources.at(-1)!, value: [...materials.values()], sources };
        } else if (candidates.some(o => hasUncertainty(o.result[field]))) item.unresolvedFields.push(field);
        continue;
      }
      const resolved = candidates.filter(o => !hasUncertainty(o.result[field]));
      const chosen = resolved.at(-1);
      if (chosen) item.known[field] = source(chosen, field);
      else item.unresolvedFields.push(field);
    }
    if (item.unresolvedFields.length) item.status = 'uncertain';
  }
  const result = [...items.values()];
  // A failed distance assessment is still missing distance information. When
  // the current frame establishes fire/smoke, a witness may already have a
  // measured reference; asking for it does not ask them to repair an API error.
  const targetVisible = result.some(item => ['visible_flames', 'forest_woodland_fire', 'visibly_burning_material', 'smoke_visibility_color_origin'].includes(item.criterionKey)
    && item.observations.some(o => o.snapshotId === latestSnapshotId && positive.has(String(o.result.classification))));
  const distance = result.find(item => item.criterionKey === 'camera_to_fire_distance');
  if (distance?.status === 'unavailable' && targetVisible) distance.unresolvedFields.push('measuredReference');
  const resolvedCount = result.filter(item => item.status === 'resolved').length;
  const unavailableCount = result.filter(item => item.status === 'unavailable').length;
  const verificationStatus = result.length > 0 && resolvedCount === result.length ? 'complete' as const : 'incomplete' as const;
  const gaps = result.flatMap(item => item.unresolvedFields.map(field => ({ id: `${item.criterionKey}.${field}`, criterionKey: item.criterionKey, field,
    priority: field === 'smokeCategory' ? 5 : priorities[item.criterionKey] ?? 6 }))).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return { scope: 'session', verificationStatus, snapshotIds: snapshots.map(s => s.id), latestSnapshotId, items: result, gaps,
    summary: `${snapshots.length} snapshots. Verification ${verificationStatus}. ${resolvedCount}/${result.length} criteria resolved from available evidence; ${unavailableCount} unavailable; ${gaps.length} actionable information gaps.\n${result.map(item => `${item.criterionName}: ${item.status}${item.unresolvedFields.length ? ` (${item.unresolvedFields.join(', ')})` : ''}`).join('\n')}\nObservations apply to their source frames and times. Earlier visibility does not establish current conditions; frame-local absence does not rule out the feature elsewhere.` };
}
