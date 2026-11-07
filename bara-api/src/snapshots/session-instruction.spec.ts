import { buildSessionChecklist } from './session-checklist.js';
import { generateSessionInstruction } from './session-instruction.js';

const checklist = () => buildSessionChecklist([{ id: 'one', time: '2026-11-07T10:00:00Z', analyses: [{ criterionKey: 'visible_flames', criterionName: 'Visible flames', criterionVersion: 1, status: 'completed', result: { classification: 'UNCERTAIN' } }] }]);
const output = (result: unknown) => Response.json({ status: 'completed', model: 'test', id: 'response-one', output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] });

describe('LLM session request generation', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('sends accumulated evidence and prior request to the model and validates the chosen unresolved field', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const fetch = vi.fn().mockResolvedValue(output({ gapId: 'visible_flames.classification', witnessMessage: 'Can you photograph the area where you see flames?', reason: 'Resolve uncertain flames.' }));
    vi.stubGlobal('fetch', fetch);
    const result = await generateSessionInstruction(checklist(), 4, { status: 'ready', checklistRevision: 3, gapId: 'visible_flames.classification', witnessMessage: 'Prior request' });
    expect(result).toMatchObject({ status: 'ready', checklistRevision: 4, gapId: 'visible_flames.classification' });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.store).toBe(false);
    expect(body.text.format.schema.properties.gapId.enum).toEqual(['visible_flames.classification']);
    const data = JSON.parse(body.input[0].content[0].text);
    expect(data.summary).toContain('1 snapshots');
    expect(data.items[0].recentObservations[0].snapshotId).toBe('one');
    expect(data.previousRequest.witnessMessage).toBe('Prior request');
  });
  it('rejects requests targeting a resolved or invented detail', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(output({ gapId: 'smoke.color', witnessMessage: 'What color?', reason: 'Invented' })));
    expect((await generateSessionInstruction(checklist(), 1)).status).toBe('unavailable');
  });
  it.each(['refusal', 'timeout', 'missing-key'])('keeps evidence when instruction generation has a %s', async failure => {
    if (failure !== 'missing-key') vi.stubEnv('OPENAI_API_KEY', 'test'); else vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubGlobal('fetch', failure === 'timeout' ? vi.fn().mockRejectedValue(new Error('timeout')) : vi.fn().mockResolvedValue(Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] })));
    expect(await generateSessionInstruction(checklist(), 2)).toEqual({ status: 'unavailable', checklistRevision: 2 });
  });
  it('skips the model when nothing remains uncertain', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const complete = buildSessionChecklist([{ id: 'one', time: '2026-11-07T10:00:00Z', analyses: [{ criterionKey: 'visible_flames', criterionName: 'Flames', status: 'completed', result: { classification: 'VISIBLE' } }] }]);
    expect((await generateSessionInstruction(complete, 2)).status).toBe('not_needed');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never reports no request needed when verification is incomplete without an actionable witness gap', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await generateSessionInstruction(buildSessionChecklist([]), 2)).status).toBe('unavailable');
    const failed = buildSessionChecklist([{ id: 'one', time: '2026-11-07T10:00:00Z', analyses: [{ criterionKey: 'visible_flames', criterionName: 'Flames', status: 'unavailable' }] }]);
    expect((await generateSessionInstruction(failed, 2)).status).toBe('unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not send declined requests or distance gaps to the instruction model', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const input = checklist();
    input.gaps.push({ id: 'camera_to_fire_distance.measuredReference', criterionKey: 'camera_to_fire_distance', field: 'measuredReference', priority: 4 },
      { id: 'smoke_visibility_color_origin.smokeCategory', criterionKey: 'smoke_visibility_color_origin', field: 'smokeCategory', priority: 5 });
    const fetch = vi.fn().mockResolvedValue(output({ gapId: 'smoke_visibility_color_origin.smokeCategory', witnessMessage: 'Show the smoke color.', reason: 'Color is unknown.' }));
    vi.stubGlobal('fetch', fetch);
    expect((await generateSessionInstruction(input, 4, undefined, ['visible_flames.classification'])).gapId).toBe('smoke_visibility_color_origin.smokeCategory');
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.text.format.schema.properties.gapId.enum).toEqual(['smoke_visibility_color_origin.smokeCategory']);
    expect(JSON.parse(body.input[0].content[0].text).gaps).toHaveLength(1);
  });
  it('stops requesting after all actionable gaps are skipped without marking evidence complete', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const input = checklist();
    expect((await generateSessionInstruction(input, 5, undefined, ['visible_flames.classification'])).status).toBe('not_needed');
    expect(input.verificationStatus).toBe('incomplete');
    expect(input.items[0]!.status).toBe('uncertain');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('moves past subjects deferred by the guided-capture cutoff', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const input = checklist();
    expect((await generateSessionInstruction(input, 5, undefined, [], ['visible_flames'])).status).toBe('not_needed');
    expect(input.verificationStatus).toBe('incomplete');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('suppresses distance-only requests and model text that tries to ask for distance', async () => {
    const input = checklist();
    input.gaps = [{ id: 'camera_to_fire_distance.measuredReference', criterionKey: 'camera_to_fire_distance', field: 'measuredReference', priority: 4 }];
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await generateSessionInstruction(input, 2)).status).toBe('not_needed');
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv('OPENAI_API_KEY', 'test');
    fetch.mockResolvedValue(output({ gapId: 'visible_flames.classification', witnessMessage: 'Share the distance to the fire.', reason: 'Invalid instruction' }));
    expect((await generateSessionInstruction(checklist(), 3)).status).toBe('unavailable');
  });
});
