import { Injectable, NotFoundException, ServiceUnavailableException, StreamableFile, OnModuleDestroy } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

@Injectable()
export class SnapshotMediaService implements OnModuleDestroy {
  private readonly bucket = process.env.S3_BUCKET ?? 'bara-media';
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
    requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
  });

  async put(key: string, buffer: Buffer, contentType: string): Promise<string> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: contentType }));
    return `s3://${this.bucket}/${key}`;
  }
  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async read(path: string): Promise<StreamableFile> {
    const prefix = `s3://${this.bucket}/`;
    if (!path.startsWith(prefix)) throw new NotFoundException('Image not found');
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: path.slice(prefix.length) }));
      if (!object.Body) throw new NotFoundException('Image not found');
      return new StreamableFile(object.Body as Readable, {
        type: object.ContentType === 'image/png' ? 'image/png' : 'image/jpeg',
        length: object.ContentLength,
      });
    } catch (error) {
      if (error instanceof NotFoundException || (error as { name?: string }).name === 'NoSuchKey') throw new NotFoundException('Image not found');
      throw new ServiceUnavailableException('Image storage unavailable');
    }
  }
  onModuleDestroy() { this.client.destroy(); }
}
