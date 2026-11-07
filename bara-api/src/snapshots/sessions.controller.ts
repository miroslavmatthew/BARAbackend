import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { SessionsService } from './sessions.service.js';

@Controller('sessions')
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService) {}
  @Get()
  list() { return this.sessions.list(); }
  @Get(':id/snapshots')
  snapshots(@Param('id') id: string) { return this.sessions.listSnapshots(id); }
  @Post()
  start() { return this.sessions.start(); }
  @Get(':id')
  get(@Param('id') id: string) { return this.sessions.get(id); }
  @Post(':id/end')
  @HttpCode(200)
  end(@Param('id') id: string) { return this.sessions.end(id); }
  @Post(':id/instruction/reject')
  @HttpCode(200)
  rejectInstruction(@Param('id') id: string, @Body() body: unknown) {
    const result = z.strictObject({ gapId: z.string().min(1).max(200), checklistRevision: z.number().int().min(0) }).safeParse(body);
    if (!result.success) throw new BadRequestException('A request ID and checklist revision are required.');
    return this.sessions.rejectInstruction(id, result.data.gapId, result.data.checklistRevision);
  }
}
