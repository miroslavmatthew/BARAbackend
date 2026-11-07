import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SnapshotsController } from '../src/snapshots/snapshots.controller.js';
import { SnapshotsService } from '../src/snapshots/snapshots.service.js';

const input = { sessionId: '507f1f77bcf86cd799439011', time: '2026-11-07T10:00:00+07:00', location: { latitude: -6.2, longitude: 106.8 }, direction: 90 };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=', 'base64');
describe('POST /snapshots', () => {
  let app: INestApplication;
  const create = vi.fn();
  beforeEach(async () => {
    create.mockReset().mockResolvedValue({ data: { ...input, imagePath: 's3://bara-media/test.png' }, message: 'waiting for instruction' });
    const module = await Test.createTestingModule({ controllers: [SnapshotsController], providers: [{ provide: SnapshotsService, useValue: { create } }] }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterEach(async () => { await app.close(); });
  function send(metadata: unknown, image = png, filename = 'test.png') {
    return request(app.getHttpServer()).post('/snapshots').field('metadata', typeof metadata === 'string' ? metadata : JSON.stringify(metadata)).attach('image', image, filename);
  }
  it('accepts a snapshot and returns the simplified echo and waiting message', async () => {
    const response = await send(input).expect(201);
    expect(response.body.message).toBe('waiting for instruction');
    expect(response.body.data.location).toEqual(input.location);
    expect(create).toHaveBeenCalledWith(input, png, 'image/png');
  });
  it.each([
    { ...input, sessionId: undefined },
    { ...input, sessionId: 'not-a-session-id' },
    { ...input, time: 'yesterday' },
    { ...input, location: { latitude: 91, longitude: 106 } },
    { ...input, location: { latitude: 1, longitude: -181 } },
    { ...input, direction: 360 },
    { ...input, direction: -1 },
    { ...input, direction: '90' },
    { ...input, imagePath: 'client-cannot-choose-path' },
    { ...input, location: null },
  ])('rejects invalid metadata %# before saving', async metadata => {
    await send(metadata).expect(400); expect(create).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON', async () => { await send('{broken').expect(400); });
  it('requires an image', async () => { await request(app.getHttpServer()).post('/snapshots').field('metadata', JSON.stringify(input)).expect(400); });
  it('rejects a fake image', async () => { await send(input, Buffer.from('not an image')).expect(400); });
  it('rejects uploads above 8 MiB', async () => { await send(input, Buffer.alloc(8 * 1024 * 1024 + 1)).expect(413); });
});

