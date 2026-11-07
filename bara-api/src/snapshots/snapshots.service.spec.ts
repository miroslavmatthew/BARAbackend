import { SnapshotsService } from './snapshots.service.js';
import type { Model } from 'mongoose';
import type { SnapshotRecord } from './snapshot.schema.js';
import type { SnapshotMediaService } from './snapshot-media.service.js';
import type { SessionsService } from './sessions.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('snapshot persistence', () => {
  const input = { sessionId: '507f1f77bcf86cd799439011', time: '2026-11-07T10:00:00+07:00', location: { latitude: -6.2, longitude: 106.8 }, direction: 90 };
  const create = vi.fn(); const put = vi.fn(); const remove = vi.fn();
  const requireActive = vi.fn();
  const updateOne = vi.fn(); const toArray = vi.fn();
  const updateChecklist = vi.fn();
  let service: SnapshotsService;
  beforeEach(() => {
    create.mockReset(); put.mockReset().mockResolvedValue('s3://bara-media/image.png'); remove.mockReset().mockResolvedValue(undefined);
    requireActive.mockReset().mockResolvedValue(undefined);
    updateOne.mockReset().mockReturnValue({ exec: async () => ({ modifiedCount: 1 }) });
    toArray.mockReset().mockResolvedValue([]);
    updateChecklist.mockReset().mockResolvedValue({ checklist: { scope: 'session', items: [] }, revision: 1, instruction: { status: 'not_needed', checklistRevision: 1 } });
    service = new SnapshotsService({ create, updateOne, db: { collection: () => ({ find: () => ({ sort: () => ({ toArray }) }) }) } } as unknown as Model<SnapshotRecord>, { put, remove } as unknown as SnapshotMediaService, { requireActive, updateChecklist } as unknown as SessionsService);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('waits for all criteria before summarizing, persists the plan, and includes one witness request', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    create.mockImplementation(async data => ({ ...data, _id: { toString: () => 'snapshot-id' } }));
    toArray.mockResolvedValue(['visible_flames', 'forest_woodland_fire'].map(key => ({ key, name: key, version: 1, prompt: 'Observe', expectedResult: { jsonSchema: {
      type: 'object', additionalProperties: false, properties: { classification: { type: 'string', enum: ['UNCERTAIN'] } }, required: ['classification'],
    } } })));
    const releases: (() => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => {
      await new Promise<void>(resolve => releases.push(resolve));
      return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"classification":"UNCERTAIN"}' }] }] });
    }));
    const pending = service.create(input, Buffer.from('image'), 'image/png');
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases[0]!();
    await Promise.resolve();
    expect(updateOne).not.toHaveBeenCalled();
    expect(updateChecklist).not.toHaveBeenCalled();
    releases[1]!();
    expect(updateChecklist).not.toHaveBeenCalled();
    releases[2]!();
    const response = await pending;
    expect(response.followUp.summary).toContain('2/2 criteria assessed. 2 have unresolved details');
    expect(updateChecklist).toHaveBeenCalledWith(input.sessionId);
    expect(response.message).not.toContain('UNCERTAIN');
    expect(response.message).not.toContain('Summary');
    expect(updateOne.mock.calls[0]![1].$set.followUp).toEqual(response.followUp);
    expect(response.followUp.prioritizedRequests).toHaveLength(2);
  });
  it('returns only the new session instruction to the witness', async () => {
    create.mockImplementation(async data => ({ ...data, _id: { toString: () => 'snapshot-id' } }));
    updateChecklist.mockResolvedValue({ checklist: { scope: 'session', items: [] }, revision: 2, instruction: { status: 'ready', checklistRevision: 2, witnessMessage: 'Can you photograph the source of the smoke?' } });
    const response = await service.create(input, Buffer.from('image'), 'image/png');
    expect(response.message).toBe('Can you photograph the source of the smoke?');
    expect(updateOne.mock.calls[0]![1].$set.analysisMessage).toContain('Summary');
  });
  it('does not build a checklist from results that failed to persist', async () => {
    create.mockImplementation(async data => ({ ...data, _id: { toString: () => 'snapshot-id' } }));
    updateOne.mockReturnValue({ exec: async () => { throw new Error('Database down'); } });
    const response = await service.create(input, Buffer.from('image'), 'image/png');
    expect(updateChecklist).not.toHaveBeenCalled();
    expect(response.message).toContain('temporarily unavailable');
  });
  it('persists GeoJSON in longitude/latitude order and returns UTC time', async () => {
    create.mockImplementation(async data => ({ ...data, _id: { toString: () => 'snapshot-id' } }));
    const response = await service.create(input, Buffer.from('image'), 'image/png');
    expect(create.mock.calls[0]![0].location).toEqual({ type: 'Point', coordinates: [106.8, -6.2] });
    expect(response.data.time).toBe('2026-11-07T03:00:00.000Z');
    expect(response.message).toContain('Snapshot saved.');
    expect(response.data.sessionId).toBe(input.sessionId);
    expect(put.mock.calls[0]![0]).toMatch(new RegExp(`^sessions/${input.sessionId}/snapshots/`));
  });
  it('removes the uploaded object if metadata persistence fails', async () => {
    create.mockRejectedValue(new Error('database down'));
    await expect(service.create(input, Buffer.from('image'), 'image/png')).rejects.toThrow('Metadata storage unavailable');
    expect(remove).toHaveBeenCalledWith(put.mock.calls[0]![0]);
  });
  it('does not save metadata when the image upload fails', async () => {
    put.mockRejectedValue(new Error('storage down'));
    await expect(service.create(input, Buffer.from('image'), 'image/png')).rejects.toThrow('Image storage unavailable');
    expect(create).not.toHaveBeenCalled();
  });
  it.each([new ConflictException('Session ended'), new NotFoundException('Session not found')])('rejects unavailable sessions before uploading', async error => {
    requireActive.mockRejectedValue(error);
    await expect(service.create(input, Buffer.from('image'), 'image/png')).rejects.toBe(error);
    expect(put).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });
});

