import { BadRequestException, Body, Controller, Get, Header, Inject, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SnapshotMetadata } from './snapshot.schema.js';
import { SnapshotsService } from './snapshots.service.js';

@Controller('snapshots')
export class SnapshotsController {
  constructor(@Inject(SnapshotsService) private readonly snapshots: SnapshotsService) {}
  @Get(':id/image')
  @Header('Cache-Control', 'private, max-age=60')
  @Header('X-Content-Type-Options', 'nosniff')
  image(@Param('id') id: string) { return this.snapshots.image(id); }

  @Post()
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 1, fieldSize: 16 * 1024 } }))
  async create(@UploadedFile() image: { buffer: Buffer; mimetype: string } | undefined, @Body('metadata') raw: unknown) {
    if (!image) throw new BadRequestException('image is required (JPEG or PNG, maximum 8 MiB)');
    const jpeg = image.mimetype === 'image/jpeg' && image.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const png = image.mimetype === 'image/png' && image.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png) throw new BadRequestException('image must contain JPEG or PNG data matching its content type');
    let body: unknown;
    try { body = typeof raw === 'string' ? JSON.parse(raw) : undefined; }
    catch { throw new BadRequestException('metadata must be a JSON string'); }
    const result = SnapshotMetadata.safeParse(body);
    if (!result.success) throw new BadRequestException({ message: 'Invalid snapshot metadata', errors: result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    return this.snapshots.create(result.data, image.buffer, image.mimetype);
  }
}
