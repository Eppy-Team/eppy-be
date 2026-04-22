import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Multer } from 'multer';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client!: S3Client;
  private bucket!: string;
  private region!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET_NAME');
    this.region = this.configService.getOrThrow<string>('AWS_REGION');

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.logger.log(
      `StorageService ready — bucket: ${this.bucket}, region: ${this.region}`,
    );
  }

  /**
   * Upload file PDF ke S3.
   * Returns URL publik dan key (untuk delete nanti).
   */
  async upload(
    file: Express.Multer.File,
    folder: string = 'knowledge',
  ): Promise<{ url: string; key: string }> {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    const key = `${folder}/${uniqueName}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: 'application/pdf',
      }),
    );

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    this.logger.log(`[upload] ${key}`);
    return { url, key };
  }

  /**
   * Hapus file dari S3 berdasarkan key.
   */
  async delete(key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    this.logger.log(`[delete] ${key}`);
  }
}