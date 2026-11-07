import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { WitnessController } from './witness.controller.js';
import { SnapshotsModule } from './snapshots/snapshots.module.js';

@Module({
  imports: [SnapshotsModule],
  controllers: [AppController, WitnessController],
  providers: [AppService],
})
export class AppModule {}
