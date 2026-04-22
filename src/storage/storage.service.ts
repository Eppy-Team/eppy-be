import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Multer } from 'multer';

/**
 * Storage Service
 *
 * AWS S3 file storage abstraction layer for knowledge base file management.
 * Handles initialization, upload, and deletion operations.
 *
 * Lifecycle:
 * - onModuleInit: Initializes S3Client with AWS credentials from the environment.
 * - Per-request: Executes upload and delete operations.
 *
 * Responsibilities:
 * - S3 connection management.
 * - PDF file uploads to S3.
 * - File deletion from S3.
 * - URL generation for uploaded files.
 *
 * Dependencies:
 * - ConfigService: AWS configuration (bucket, region, credentials).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client!: S3Client;
  private bucket!: string;
  private region!: string;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initialize the S3 client during module initialization.
   *
   * Reads AWS credentials and bucket information from ConfigService.
   * Called automatically by NestJS when the module is loaded.
   *
   * @throws {Error} If required environment variables are missing or incomplete.
   *
   * @remarks
   * Required environment variables:
   * - AWS_S3_BUCKET_NAME
   * - AWS_REGION
   * - AWS_ACCESS_KEY_ID
   * - AWS_SECRET_ACCESS_KEY
   */
  onModuleInit() {
    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET_NAME');
    this.region = this.configService.getOrThrow<string>('AWS_REGION');

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });

    this.logger.log(
      `StorageService ready — bucket: ${this.bucket}, region: ${this.region}`,
    );
  }

  /**
   * Upload a PDF file to S3.
   *
   * Generates a unique filename and uploads it to the S3 bucket within a specific folder structure.
   * Returns the public URL and S3 key for future reference.
   *
   * @param file - Multer file object (buffer from memory storage).
   * @param folder - S3 folder path (defaults to 'knowledge').
   * @returns An object containing the public URL and the S3 key.
   *
   * @remarks
   * File naming convention: `{timestamp}-{random}.pdf`.
   * Content-Type is strictly set to 'application/pdf'.
   * Returns the public S3 URL in the following format:
   * `https://{bucket}.s3.{region}.amazonaws.com/{key}`
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
   * Delete a file from S3 using its object key.
   *
   * @param key - The S3 object key (path).
   * @returns Promise<void>
   *
   * @remarks
   * This operation is idempotent; it is safe to call with a non-existent key
   * (S3 does not throw an error in this case).
   * Designed for asynchronous deletion without blocking the main process.
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
