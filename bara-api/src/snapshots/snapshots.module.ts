import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SnapshotSchema } from './snapshot.schema.js';
import { SnapshotMediaService } from './snapshot-media.service.js';
import { SnapshotsController } from './snapshots.controller.js';
import { SnapshotsService } from './snapshots.service.js';
import { SessionSchema } from './session.schema.js';
import { SessionsService } from './sessions.service.js';
import { SessionsController } from './sessions.controller.js';

@Module({
  imports: [
    MongooseModule.forRootAsync({ useFactory: () => {
      if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
      return { uri: process.env.MONGODB_URI, serverSelectionTimeoutMS: 5000, retryAttempts: 2 };
    } }),
    MongooseModule.forFeature([{ name: 'Snapshot', schema: SnapshotSchema }, { name: 'CaptureSession', schema: SessionSchema }]),
  ],
  controllers: [SnapshotsController, SessionsController], providers: [SnapshotsService, SnapshotMediaService, SessionsService],
})
export class SnapshotsModule {}
