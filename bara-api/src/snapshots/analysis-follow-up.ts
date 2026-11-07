import type { analyzeCriteria } from './criteria-analysis.js';

type Analysis = Awaited<ReturnType<typeof analyzeCriteria>>[number];
export interface InformationRequest {
  type: 'general_information';
  priority: number;
  criterionKeys: string[];
  missingInformation: string[];
  reason: string;
  witnessMessage: string;
}

const unresolvedValues = new Set(['UNCERTAIN', 'UNKNOWN', 'NOT_VISIBLE', 'NO_VISIBLE_FOREST_FIRE', 'NO_VISIBLE_BURNING', 'NOT_DETERMINABLE', 'NOT_LOCATABLE', 'RELATIVE_ONLY', 'OBSCURED', 'OUTSIDE_FRAME', 'PERSON_ROLE_UNKNOWN', 'OPERATOR_NOT_VISIBLE']);

// Follow structured fields, not free-text keyword matches. UNCONFIRMED peat is
// deliberately excluded: another ordinary photo cannot establish peat involvement.
function unresolvedFields(value: unknown, path = ''): string[] {
  if (typeof value === 'string') return unresolvedValues.has(value) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => unresolvedFields(item, `${path}[${index}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => unresolvedFields(item, path ? `${path}.${key}` : key));
  return [];
}

export function buildAnalysisFollowUp(analyses: Analysis[]) {
  const findings = analyses.map(analysis => {
    const result = 'result' in analysis ? analysis.result : undefined;
    return {
      criterionKey: analysis.criterionKey, criterionName: analysis.criterionName,
      status: analysis.status === 'completed' ? 'assessed' as const : 'unavailable' as const,
      classification: typeof result?.classification === 'string' ? result.classification : null,
      unresolvedFields: analysis.status === 'completed' ? unresolvedFields(result) : [],
      // Keep actual observations alongside gaps, including partially resolved criteria.
      observations: result ?? null,
    };
  });
  const gaps = findings.filter(finding => finding.status === 'assessed' && finding.unresolvedFields.length);
  const requests: InformationRequest[] = [];
  const add = (keys: string[], priority: number, reason: string, witnessMessage: string) => {
    const relevant = gaps.filter(gap => keys.includes(gap.criterionKey));
    if (!relevant.length) return;
    requests.push({ type: 'general_information', priority,
      criterionKeys: relevant.map(gap => gap.criterionKey),
      missingInformation: relevant.flatMap(gap => gap.unresolvedFields.map(field => `${gap.criterionKey}.${field}`)),
      reason, witnessMessage });
  };
  add(['visible_flames', 'smoke_visibility_color_origin'], 1,
    'Establish the visible fire or smoke source before asking about its details; one photo may resolve several gaps.',
    'From your current safe position, can you photograph the area where you see fire or smoke, including where it appears to come from? If you cannot see the source, you can tell us that.');
  add(['forest_woodland_fire', 'visibly_burning_material'], 2,
    'Identify the setting and affected material together without assuming nearby objects are burning.',
    'From your current safe position, can you take a photo showing the affected area and the surrounding trees, ground, or buildings? If the affected material is hidden, you can tell us that.');
  add(['fire_suppression'], 3,
    'Clarify response activity and unknown roles after the source and setting.',
    'Can you see anyone responding to the fire? If so, from where you are, can you photograph what they are doing and any equipment in use? If nobody is visible, you can tell us that.');
  add(['camera_to_fire_distance'], 4,
    'Distance needs a locatable target and a measured reference; another unreferenced photo cannot establish a number.',
    'Do you already know a measured distance or a mapped location for the fire or smoke source? If so, please share it and the landmark it refers to. Otherwise, you can say you do not know.');
  const known = new Set(requests.flatMap(request => request.criterionKeys));
  const unsupportedCriteria = gaps.filter(gap => !known.has(gap.criterionKey)).map(gap => gap.criterionKey);
  const unavailable = findings.filter(finding => finding.status === 'unavailable');
  const summary = analyses.length
    ? `${findings.length - unavailable.length}/${findings.length} criteria assessed. ${gaps.length} have unresolved details; ${unavailable.length} unavailable.\n${findings.map(finding => `${finding.criterionName}: ${finding.classification ?? 'analysis unavailable'}${finding.unresolvedFields.length ? `; unresolved: ${finding.unresolvedFields.join(', ')}` : ''}`).join('\n')}`
    : 'No criterion results are available to summarize.';
  return {
    scope: 'snapshot' as const, summary, findings,
    // One witness request at a time; remaining requests are the reviewable scaffold.
    nextRequest: requests[0] ?? null, prioritizedRequests: requests,
    unavailableCriteria: unavailable.map(finding => finding.criterionKey), unsupportedCriteria,
  };
}

export type AnalysisFollowUp = ReturnType<typeof buildAnalysisFollowUp>;
