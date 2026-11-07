import { assessCaptureQuality } from './capture-quality.js';
import type { Criterion } from './criteria-analysis.js';

const criteria = [{ key: 'visible_flames', name: 'Flames' }] as Criterion[];
describe('image quality assessment', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('sends the image and validates subject-specific blur and framing', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ visible_flames: { status: 'CUT_OFF', framing: 'BOTTOM', evidence: 'The burning base is cropped at the bottom edge.' } }) }] }] }));
    vi.stubGlobal('fetch', fetch);
    const quality = await assessCaptureQuality(criteria, Buffer.from('image'), 'image/png');
    expect(quality.status).toBe('completed');
    expect(quality.assessments.visible_flames!.framing).toBe('BOTTOM');
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.store).toBe(false);
    expect(body.input[0].content[1].type).toBe('input_image');
  });
  it('rejects an invented camera direction for an absent subject', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ visible_flames: { status: 'NOT_PRESENT', framing: 'LEFT', evidence: 'No flames.' } }) }] }] })));
    expect((await assessCaptureQuality(criteria, Buffer.from('image'), 'image/png')).status).toBe('unavailable');
  });
  it('isolates timeouts and invalid output', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect(await assessCaptureQuality(criteria, Buffer.from('image'), 'image/png')).toEqual({ status: 'unavailable', assessments: {} });
  });
});
