import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { SessionRecord } from './session.schema.js';
import type { SnapshotRecord } from './snapshot.schema.js';
import { buildSessionChecklist } from './session-checklist.js';
import { generateSessionInstruction } from './session-instruction.js';
import { planCaptureGuidance } from './capture-guidance.js';

@Injectable()
export class SessionsService {
  constructor(@InjectModel('CaptureSession') private readonly sessions: Model<SessionRecord>,
    @InjectModel('Snapshot') private readonly snapshots: Model<SnapshotRecord>) {}

  async list() {
    const rows = await this.sessions.aggregate([
      { $sort: { startedAt: -1, _id: -1 } },
      { $lookup: { from: 'snapshots', let: { session: '$_id' }, pipeline: [
        { $match: { $expr: { $eq: ['$sessionId', '$$session'] } } }, { $count: 'count' },
      ], as: 'captures' } },
      { $set: { criteriaItems: { $filter: { input: { $ifNull: ['$checklist.items', []] }, as: 'item',
        cond: { $ne: ['$$item.criterionKey', 'camera_to_fire_distance'] } } } } },
      { $project: { _id: 0, id: { $toString: '$_id' }, startedAt: 1, endedAt: 1, status: 1,
        criteriaFulfillment: { total: { $size: '$criteriaItems' }, confirmed: { $size: { $filter: { input: '$criteriaItems', as: 'item', cond: { $eq: ['$$item.status', 'resolved'] } } } } },
        snapshotCount: { $ifNull: [{ $arrayElemAt: ['$captures.count', 0] }, 0] } } },
    ]).exec();
    return { data: rows };
  }

  async listSnapshots(id: string) {
    await this.get(id);
    const rows = await this.snapshots.find({ sessionId: this.validateId(id) }).sort({ time: 1, _id: 1 }).lean().exec();
    return { data: rows.map(row => ({ id: row._id.toString(), sessionId: row.sessionId.toString(),
      time: row.time.toISOString(), location: { latitude: row.location.coordinates[1], longitude: row.location.coordinates[0] },
      direction: row.direction, analyses: row.analyses, captureQuality: row.captureQuality, followUp: row.followUp, analysisMessage: row.analysisMessage, analyzedAt: row.analyzedAt, imageUrl: `/snapshots/${row._id.toString()}/image` })) };
  }

  private validateId(id: string) {
    if (!/^[a-f\d]{24}$/i.test(id)) throw new BadRequestException('Invalid session ID');
    return new Types.ObjectId(id);
  }
  async updateChecklist(id: string) {
    const objectId = this.validateId(id);
    // Rebuild from persisted evidence, including earlier snapshots. A revision
    // check prevents overlapping completions from losing evidence or publishing
    // instructions generated against an obsolete checklist.
    for (let attempt = 0; attempt < 4; attempt++) {
      const session = await this.sessions.findById(objectId).exec();
      if (!session) throw new NotFoundException('Session not found');
      const previousRevision = session.checklistRevision ?? 0;
      const rows = await this.snapshots.find({ sessionId: objectId, analyzedAt: { $exists: true } }).sort({ time: 1, _id: 1 }).lean().exec();
      const checklist = buildSessionChecklist(rows.map(row => ({ id: row._id.toString(), time: row.time.toISOString(), analyses: row.analyses, captureQuality: row.captureQuality })));
      const revision = previousRevision + 1;
      const guidance = planCaptureGuidance(checklist, revision, session.instruction, session.captureAttempts, session.dismissedGapIds);
      checklist.deferredCriteria = guidance.deferredCriterionKeys;
      const revisionFilter = previousRevision === 0
        ? { $or: [{ checklistRevision: 0 }, { checklistRevision: { $exists: false } }] }
        : { checklistRevision: previousRevision };
      const saved = await this.sessions.updateOne({ _id: objectId, ...revisionFilter }, {
        $set: { checklist, checklistRevision: revision, captureAttempts: guidance.attempts, instruction: { status: 'unavailable', checklistRevision: revision } },
      }).exec();
      if (!saved.modifiedCount) continue;
      const instruction = session.status === 'active'
        ? guidance.instruction ?? await generateSessionInstruction(checklist, revision, session.instruction, session.dismissedGapIds, guidance.deferredCriterionKeys)
        : { status: 'not_needed' as const, checklistRevision: revision };
      const published = await this.sessions.updateOne({ _id: objectId, checklistRevision: revision, status: 'active' }, { $set: { instruction } }).exec();
      return { checklist, revision, instruction: published.modifiedCount ? instruction : { status: 'unavailable' as const, checklistRevision: revision } };
    }
    throw new ConflictException('Session evidence changed concurrently; checklist update will retry after the next capture.');
  }
  async start() {
    const saved = await this.sessions.create({});
    return { data: { id: saved._id.toString(), startedAt: saved.startedAt, endedAt: saved.endedAt, status: saved.status, checklistRevision: saved.checklistRevision, checklist: saved.checklist, instruction: saved.instruction } };
  }
  async rejectInstruction(id: string, gapId: string, expectedRevision: number) {
    const objectId = this.validateId(id);
    const session = await this.sessions.findById(objectId).exec();
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'active') throw new ConflictException('Session has ended.');
    if (!session.checklist || session.instruction?.status !== 'ready' || session.instruction.gapId !== gapId
      || session.checklistRevision !== expectedRevision || session.instruction.checklistRevision !== expectedRevision) {
      throw new ConflictException('The request has changed. Refresh the session before skipping it.');
    }
    const revision = expectedRevision + 1;
    const saved = await this.sessions.updateOne({ _id: objectId, status: 'active', checklistRevision: expectedRevision,
      'instruction.status': 'ready', 'instruction.gapId': gapId, 'instruction.checklistRevision': expectedRevision }, {
      $addToSet: { dismissedGapIds: gapId },
      $set: { checklistRevision: revision, instruction: { status: 'unavailable', checklistRevision: revision } },
    }).exec();
    if (!saved.modifiedCount) throw new ConflictException('The request has changed. Refresh the session before skipping it.');
    const instruction = await generateSessionInstruction(session.checklist, revision, session.instruction,
      [...(session.dismissedGapIds ?? []), gapId], session.checklist.deferredCriteria);
    await this.sessions.updateOne({ _id: objectId, status: 'active', checklistRevision: revision }, { $set: { instruction } }).exec();
    return this.get(id);
  }
  async get(id: string) {
    const saved = await this.sessions.findById(this.validateId(id)).exec();
    if (!saved) throw new NotFoundException('Session not found');
    return { data: { id: saved._id.toString(), startedAt: saved.startedAt, endedAt: saved.endedAt, status: saved.status, checklistRevision: saved.checklistRevision, checklist: saved.checklist, instruction: saved.instruction } };
  }
  async requireActive(id: string) {
    const session = await this.get(id);
    if (session.data.status !== 'active') throw new ConflictException('Session has ended. Start a new session before capturing.');
  }
  async end(id: string) {
    const objectId = this.validateId(id);
    await this.sessions.updateOne({ _id: objectId, status: 'active' }, { $set: { status: 'ended', endedAt: new Date() } }).exec();
    return this.get(id);
  }
}
