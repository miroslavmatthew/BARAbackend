import { analyzeFlames } from './flame-analysis.js';

describe('flame analysis', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it.each(['VISIBLE', 'NOT_VISIBLE', 'UNCERTAIN'])('returns validated %s evidence', async classification => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'completed', model: 'test', id: 'response', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ classification, visualEvidence: 'Observed features', locationInImage: 'center', limitations: 'none apparent' }) }] }] }));
    vi.stubGlobal('fetch', fetch);
    const result = await analyzeFlames(Buffer.from('image'), 'image/png');
    expect(result.status).toBe('completed');
    expect(result.message).toContain(`Classification: ${classification}`);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.text.format.strict).toBe(true);
    expect(body.store).toBe(false);
    if (classification === 'NOT_VISIBLE') expect(result.message).toContain('does not mean there is no fire');
  });
  it.each([{}, { status: 'incomplete' }, { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }])('does not turn an invalid response into a negative detection', async payload => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
    const result = await analyzeFlames(Buffer.from('image'), 'image/png');
    expect(result.status).toBe('unavailable');
    expect(result.message).toContain('Snapshot saved');
    expect(result.message).not.toContain('NOT_VISIBLE');
  });
});
