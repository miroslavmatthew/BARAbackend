import { analyzeCriteria, type Criterion } from './criteria-analysis.js';
const criterion = (key: string): Criterion => ({ key, name: key, version: 2, prompt: `Database prompt ${key}`, expectedResult: { jsonSchema: { type: 'object', additionalProperties: false, properties: { classification: { type: 'string', enum: ['VISIBLE', 'NOT_VISIBLE'] } }, required: ['classification'] } } });
describe('parallel criteria analysis', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('starts all requests before any finishes and isolates a failed request', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const releases: (() => void)[] = [];
    const fetch = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      await new Promise<void>(resolve => releases.push(resolve));
      if (body.text.format.name === 'bad') return new Response('', { status: 429 });
      expect(body.instructions).toContain(`Database prompt ${body.text.format.name}`);
      expect(body.instructions).toContain('Prefer UNCERTAIN when evidence is insufficient');
      return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"classification":"VISIBLE"}' }] }] });
    });
    vi.stubGlobal('fetch', fetch);
    const pending = analyzeCriteria(['one', 'bad', 'three', 'four', 'five'].map(criterion), Buffer.from('image'), 'image/png');
    expect(fetch).toHaveBeenCalledTimes(5);
    releases.forEach(release => release());
    const results = await pending;
    expect(results.map(r => r.status)).toEqual(['completed', 'unavailable', 'completed', 'completed', 'completed']);
    expect(results[0]!.criterionVersion).toBe(2);
  });
  it('rejects output inconsistent with stored rules', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const rule = criterion('smoke');
    rule.expectedResult.consistencyRules = [{ when: { classification: 'VISIBLE' }, require: { classification: 'NOT_VISIBLE' } }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"classification":"VISIBLE"}' }] }] })));
    expect((await analyzeCriteria([rule], Buffer.from('image'), 'image/png'))[0]!.status).toBe('unavailable');
  });
  it('preserves uncertain suppression when no actor can be identified', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const rule = criterion('fire_suppression');
    rule.expectedResult.jsonSchema.properties!.classification!.enum!.push('UNCERTAIN');
    rule.expectedResult.jsonSchema.properties!.actors = { type: 'array', items: { type: 'string' } };
    rule.expectedResult.jsonSchema.required!.push('actors');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"classification":"UNCERTAIN","actors":[]}' }] }] })));
    const result = (await analyzeCriteria([rule], Buffer.from('image'), 'image/png'))[0]!;
    expect(result.status).toBe('completed');
    expect(result).toMatchObject({ result: { classification: 'UNCERTAIN', actors: [] } });
  });
});
