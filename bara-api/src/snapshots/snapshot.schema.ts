import { Schema, Types } from 'mongoose';
import { z } from 'zod';
import type { AnalysisFollowUp } from './analysis-follow-up.js';
import type { CaptureQuality } from './capture-quality.js';

export const SnapshotMetadata = z.strictObject({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i, 'sessionId must be a MongoDB ObjectId'),
  time: z.iso.datetime({ offset: true }),
  location: z.strictObject({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  direction: z.number().min(0).lt(360),
});
export type SnapshotInput = z.infer<typeof SnapshotMetadata>;
export interface SnapshotRecord {
  sessionId: Types.ObjectId;
  time: Date;
  location: { type: 'Point'; coordinates: number[] };
  direction: number;
  imagePath: string;
  createdAt: Date;
  analyses?: unknown[];
  analysisMessage?: string;
  followUp?: AnalysisFollowUp;
  analyzedAt?: Date;
  captureQuality?: CaptureQuality;
}

export const SnapshotSchema = new Schema<SnapshotRecord>({
  sessionId: { type: Schema.Types.ObjectId, ref: 'CaptureSession', required: true },
  time: { type: Date, required: true },
  location: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: {
      type: [Number], required: true,
      validate: (v: number[]) => v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Math.abs(v[0]!) <= 180 && Math.abs(v[1]!) <= 90,
    },
  },
  direction: { type: Number, required: true, min: 0, validate: (v: number) => Number.isFinite(v) && v < 360 },
  imagePath: { type: String, required: true },
  analyses: { type: [Schema.Types.Mixed], default: undefined },
  analysisMessage: String,
  followUp: Schema.Types.Mixed,
  analyzedAt: Date,
  captureQuality: Schema.Types.Mixed,
}, { collection: 'snapshots', timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
SnapshotSchema.index({ time: -1 });
SnapshotSchema.index({ sessionId: 1, time: 1 });
SnapshotSchema.index({ location: '2dsphere' });
SnapshotSchema.index({ imagePath: 1 }, { unique: true });
