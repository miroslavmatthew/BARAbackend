import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { SnapshotMediaService } from './snapshot-media.service.js';
import type { SnapshotInput, SnapshotRecord } from './snapshot.schema.js';
import { SessionsService } from './sessions.service.js';
import { analyzeCriteria, type Criterion } from './criteria-analysis.js';
import { buildAnalysisFollowUp } from './analysis-follow-up.js';
import { assessCaptureQuality, type CaptureQuality } from './capture-quality.js';

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);
  constructor(
    @InjectModel('Snapshot') private readonly snapshots: Model<SnapshotRecord>,
    @Inject(SnapshotMediaService) private readonly media: SnapshotMediaService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  async image(id: string) {
    if (!/^[a-f\d]{24}$/i.test(id)) throw new BadRequestException('Invalid snapshot ID');
    const snapshot = await this.snapshots.findById(id).exec();
    if (!snapshot || !snapshot.sessionId) throw new NotFoundException('Snapshot not found');
    return this.media.read(snapshot.imagePath);
  }

  async create(metadata: SnapshotInput, image: Buffer, contentType: string) {
    await this.sessions.requireActive(metadata.sessionId);
    const extension = contentType === 'image/png' ? 'png' : 'jpg';
    const key = `sessions/${metadata.sessionId}/snapshots/${randomUUID()}.${extension}`;
    let imagePath: string;
    try { imagePath = await this.media.put(key, image, contentType); }
    catch { throw new ServiceUnavailableException('Image storage unavailable; snapshot was not saved'); }
    let saved;
    try {
      saved = await this.snapshots.create({
        sessionId: metadata.sessionId,
        time: new Date(metadata.time),
        location: { type: 'Point', coordinates: [metadata.location.longitude, metadata.location.latitude] },
        direction: metadata.direction, imagePath,
      });
    } catch {
      try { await this.media.remove(key); }
      catch { this.logger.error(`Could not remove orphaned snapshot image: ${key}`); }
      throw new ServiceUnavailableException('Metadata storage unavailable; snapshot was not saved');
    }
    let analyses: Awaited<ReturnType<typeof analyzeCriteria>> = [];
    let captureQuality: CaptureQuality = { status: 'unavailable', assessments: {} };
    let message: string;
    try {
      const criteria = await this.snapshots.db.collection('analysis_criteria').find({ active: true }).sort({ order: 1 }).toArray();
      [analyses, captureQuality] = await Promise.all([
        analyzeCriteria(criteria as unknown as Criterion[], image, contentType),
        assessCaptureQuality(criteria as unknown as Criterion[], image, contentType),
      ]);
      message = analyses.length ? analyses.map(item => item.message).join('\n\n') : 'No analysis criteria are active.';
    } catch {
      message = 'Analysis criteria unavailable. No classification was made.';
    }
    const followUp = buildAnalysisFollowUp(analyses);
    const analysisMessage = `Snapshot saved.\n\nSummary\n${followUp.summary}\n\n${message}\n\nResults describe only this image. No visible evidence does not rule out fire or smoke hidden or outside the frame.`;
    let sessionUpdate: Awaited<ReturnType<SessionsService['updateChecklist']>> | undefined;
    try {
      await this.snapshots.updateOne({ _id: saved._id }, { $set: { analyses, captureQuality, followUp, analysisMessage, analyzedAt: new Date() } }).exec();
      sessionUpdate = await this.sessions.updateChecklist(metadata.sessionId);
    } catch {
      this.logger.error('Could not persist analysis or update the session checklist');
    }
    // Temporarily suppress the detailed report in the witness response. It is
    // retained on the snapshot for the intelligence dashboard.
    message = sessionUpdate?.instruction.status === 'ready'
      ? sessionUpdate.instruction.witnessMessage!
      : sessionUpdate?.instruction.status === 'not_needed'
        ? 'Snapshot saved. No additional information is requested right now.'
        : 'Snapshot saved. The next request is temporarily unavailable.';
    return {
      data: { id: saved._id.toString(), sessionId: saved.sessionId.toString(), time: saved.time.toISOString(), location: metadata.location, direction: saved.direction, imagePath: saved.imagePath },
      analyses, captureQuality, followUp, checklist: sessionUpdate?.checklist, checklistRevision: sessionUpdate?.revision,
      instruction: sessionUpdate?.instruction, message,
    };
  }
}
