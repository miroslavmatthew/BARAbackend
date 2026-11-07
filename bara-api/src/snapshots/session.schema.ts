import { Schema } from 'mongoose';
import type { SessionChecklist } from './session-checklist.js';
import type { SessionInstruction } from './session-instruction.js';
import type { CaptureAttempt } from './capture-guidance.js';

export interface SessionRecord {
  startedAt: Date;
  endedAt: Date | null;
  status: 'active' | 'ended';
  checklistRevision?: number;
  checklist?: SessionChecklist;
  instruction?: SessionInstruction;
  dismissedGapIds?: string[];
  captureAttempts?: CaptureAttempt[];
}
export const SessionSchema = new Schema<SessionRecord>({
  startedAt: { type: Date, required: true, default: Date.now },
  endedAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'ended'], default: 'active', required: true },
  checklistRevision: { type: Number, default: 0 },
  checklist: Schema.Types.Mixed,
  instruction: Schema.Types.Mixed,
  dismissedGapIds: { type: [String], default: [] },
  captureAttempts: { type: [Schema.Types.Mixed], default: [] },
}, { collection: 'sessions', versionKey: false });
SessionSchema.index({ startedAt: -1 });
