import type { Model } from 'mongoose';
import type { SessionRecord } from './session.schema.js';
import type { SnapshotRecord } from './snapshot.schema.js';
import { SessionsService } from './sessions.service.js';
import { generateSessionInstruction } from './session-instruction.js';

vi.mock('./session-instruction.js', () => ({ generateSessionInstruction: vi.fn() }));

describe('session checklist persistence and instruction revisions', () => {
  const id = '507f1f77bcf86cd799439011';
  const findById = vi.fn(); const updateOne = vi.fn(); const find = vi.fn(); const rows = vi.fn();
  const service = new SessionsService({ findById, updateOne } as unknown as Model<SessionRecord>, { find } as unknown as Model<SnapshotRecord>);
  beforeEach(() => {
    vi.resetAllMocks();
    findById.mockReturnValue({ exec: async () => ({ status: 'active', checklistRevision: 1, instruction: { status: 'ready', checklistRevision: 1, witnessMessage: 'Old question' } }) });
    rows.mockResolvedValue([
      { _id: 'first', time: new Date('2026-11-07T10:00:00Z'), analyses: [{ criterionKey: 'visible_flames', criterionName: 'Flames', criterionVersion: 1, status: 'completed', result: { classification: 'VISIBLE' } }] },
      { _id: 'second', time: new Date('2026-11-07T10:01:00Z'), analyses: [{ criterionKey: 'visible_flames', criterionName: 'Flames', criterionVersion: 1, status: 'completed', result: { classification: 'UNCERTAIN' } }] },
    ]);
    find.mockReturnValue({ sort: () => ({ lean: () => ({ exec: rows }) }) });
    updateOne.mockReturnValue({ exec: async () => ({ modifiedCount: 1 }) });
    vi.mocked(generateSessionInstruction).mockResolvedValue({ status: 'not_needed', checklistRevision: 2 });
  });
  it('rebuilds from persisted session snapshots, saves the checklist, then invokes the model', async () => {
    const result = await service.updateChecklist(id);
    expect(find.mock.calls[0]![0].sessionId.toString()).toBe(id);
    expect(find.mock.calls[0]![0].analyzedAt).toEqual({ $exists: true });
    expect(result.checklist.snapshotIds).toEqual(['first', 'second']);
    expect(result.checklist.gaps).toEqual([]);
    expect(updateOne.mock.calls[0]![0].checklistRevision).toBe(1);
    expect(updateOne.mock.calls[0]![1].$set.checklistRevision).toBe(2);
    expect(updateOne.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(generateSessionInstruction).mock.invocationCallOrder[0]!);
    expect(result.instruction.status).toBe('not_needed');
  });
  it('rejects an obsolete model instruction when another snapshot advanced the checklist', async () => {
    vi.mocked(generateSessionInstruction).mockResolvedValue({ status: 'ready', checklistRevision: 2, gapId: 'visible_flames.classification', witnessMessage: 'Stale question' });
    updateOne.mockReturnValueOnce({ exec: async () => ({ modifiedCount: 1 }) }).mockReturnValueOnce({ exec: async () => ({ modifiedCount: 0 }) });
    const result = await service.updateChecklist(id);
    expect(updateOne.mock.calls[1]![0]).toMatchObject({ checklistRevision: 2, status: 'active' });
    expect(result.instruction).toEqual({ status: 'unavailable', checklistRevision: 2 });
  });
  it('rereads evidence after an optimistic update loses a race', async () => {
    updateOne.mockReturnValueOnce({ exec: async () => ({ modifiedCount: 0 }) });
    await service.updateChecklist(id);
    expect(rows).toHaveBeenCalledTimes(2);
    expect(generateSessionInstruction).toHaveBeenCalledTimes(1);
  });
  it('keeps the checklist when the model cannot generate an instruction', async () => {
    vi.mocked(generateSessionInstruction).mockResolvedValue({ status: 'unavailable', checklistRevision: 2 });
    const result = await service.updateChecklist(id);
    expect(result.checklist.items[0]!.known.classification!.value).toBe('VISIBLE');
    expect(result.instruction.status).toBe('unavailable');
  });
  it('does not request new information after a session ends', async () => {
    findById.mockReturnValue({ exec: async () => ({ status: 'ended', checklistRevision: 1 }) });
    await service.updateChecklist(id);
    expect(generateSessionInstruction).not.toHaveBeenCalled();
  });
});
