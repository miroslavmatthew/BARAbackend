import { SessionsService } from './sessions.service.js';
import type { Model } from 'mongoose';
import type { SessionRecord } from './session.schema.js';
import type { SnapshotRecord } from './snapshot.schema.js';

describe('session lifecycle', () => {
  const id = '507f1f77bcf86cd799439011';
  const findById = vi.fn(); const create = vi.fn(); const updateOne = vi.fn();
  const service = new SessionsService({ findById, create, updateOne } as unknown as Model<SessionRecord>, {} as Model<SnapshotRecord>);
  beforeEach(() => { vi.resetAllMocks(); });
  const saved = (status = 'active') => ({ _id: id, status, startedAt: new Date(), endedAt: status === 'ended' ? new Date() : null });
  it('starts an active session', async () => {
    create.mockResolvedValue(saved());
    expect((await service.start()).data.status).toBe('active');
  });
  it('rejects invalid IDs without querying MongoDB', async () => {
    await expect(service.requireActive('bad')).rejects.toThrow('Invalid session ID');
    expect(findById).not.toHaveBeenCalled();
  });
  it('rejects missing sessions', async () => {
    findById.mockReturnValue({ exec: async () => null });
    await expect(service.requireActive(id)).rejects.toThrow('Session not found');
  });
  it('rejects ended sessions', async () => {
    findById.mockReturnValue({ exec: async () => saved('ended') });
    await expect(service.requireActive(id)).rejects.toThrow('Session has ended');
  });
  it('ends a session without rewriting an already ended session timestamp', async () => {
    const ended = saved('ended');
    updateOne.mockReturnValue({ exec: async () => ({ modifiedCount: 0 }) });
    findById.mockReturnValue({ exec: async () => ended });
    expect((await service.end(id)).data.endedAt).toBe(ended.endedAt);
    expect(updateOne.mock.calls[0]![0].status).toBe('active');
  });
});
