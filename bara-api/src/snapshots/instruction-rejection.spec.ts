import type { Model } from 'mongoose';
import { SessionsService } from './sessions.service.js';
import { SessionsController } from './sessions.controller.js';
import { buildSessionChecklist } from './session-checklist.js';
import { generateSessionInstruction } from './session-instruction.js';
import type { SessionRecord } from './session.schema.js';
import type { SnapshotRecord } from './snapshot.schema.js';

vi.mock('./session-instruction.js', () => ({ generateSessionInstruction: vi.fn() }));

describe('one-tap request rejection', () => {
  const id = '507f1f77bcf86cd799439011';
  const gapId = 'visible_flames.classification';
  const checklist = buildSessionChecklist([{ id: 'one', time: '2026-11-07T10:00:00Z', analyses: [
    { criterionKey: 'visible_flames', criterionName: 'Flames', status: 'completed', result: { classification: 'UNCERTAIN' } },
  ] }]);
  const findById = vi.fn(), updateOne = vi.fn();
  const service = new SessionsService({ findById, updateOne } as unknown as Model<SessionRecord>, {} as Model<SnapshotRecord>);
  beforeEach(() => {
    vi.resetAllMocks();
    findById.mockReturnValue({ exec: async () => ({ _id: id, status: 'active', checklistRevision: 4, checklist,
      instruction: { status: 'ready', gapId, checklistRevision: 4 }, dismissedGapIds: [] }) });
    updateOne.mockReturnValue({ exec: async () => ({ modifiedCount: 1 }) });
    vi.mocked(generateSessionInstruction).mockResolvedValue({ status: 'not_needed', checklistRevision: 5 });
  });
  it('persists the declined gap and advances the request revision without altering the checklist', async () => {
    await service.rejectInstruction(id, gapId, 4);
    expect(updateOne.mock.calls[0]![0]).toMatchObject({ status: 'active', checklistRevision: 4, 'instruction.gapId': gapId });
    expect(updateOne.mock.calls[0]![1]).toEqual({ $addToSet: { dismissedGapIds: gapId },
      $set: { checklistRevision: 5, instruction: { status: 'unavailable', checklistRevision: 5 } } });
    expect(generateSessionInstruction).toHaveBeenCalledWith(checklist, 5, expect.anything(), [gapId], undefined);
    expect(checklist.items[0]!.status).toBe('uncertain');
    expect(updateOne.mock.calls[1]![0]).toMatchObject({ status: 'active', checklistRevision: 5 });
  });
  it('rejects stale requests instead of declining a newer request', async () => {
    await expect(service.rejectInstruction(id, gapId, 3)).rejects.toThrow('request has changed');
    expect(updateOne).not.toHaveBeenCalled();
  });
  it('does not publish a replacement after losing a concurrent update', async () => {
    updateOne.mockReturnValueOnce({ exec: async () => ({ modifiedCount: 0 }) });
    await expect(service.rejectInstruction(id, gapId, 4)).rejects.toThrow('request has changed');
    expect(generateSessionInstruction).not.toHaveBeenCalled();
  });
  it('accepts the request identifier with no reason, and rejects malformed bodies', async () => {
    const rejectInstruction = vi.fn().mockResolvedValue({ data: {} });
    const controller = new SessionsController({ rejectInstruction } as unknown as SessionsService);
    await controller.rejectInstruction(id, { gapId, checklistRevision: 4 });
    expect(rejectInstruction).toHaveBeenCalledWith(id, gapId, 4);
    expect(() => controller.rejectInstruction(id, {})).toThrow('request ID');
  });
});
