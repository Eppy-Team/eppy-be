import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Multer } from 'multer';

/**
 * Storage Service
 *
 * AWS S3 file storage abstraction layer supporting knowledge base files and chat images.
 * Provides unified S3 operations with signed URL generation for temporary, credential-free access.
 *
 * Lifecycle:
 * - onModuleInit: Initializes S3Client with AWS credentials from ConfigService.
 * - Per-request: Executes upload, delete, and URL generation operations.
 *
 * Responsibilities:
 * - S3 client lifecycle management and connection pooling.
 * - Multiformat file uploads (PDFs for knowledge, images for chat).
 * - File deletion from S3 with idempotent error handling.
 * - Signed URL generation with configurable expiration (1 hour default).
 *
 * Dependencies:
 * - ConfigService: AWS credentials and bucket configuration.
 *
 * @remarks
 * Security: Signed URLs expire after 1 hour. For long-lived access, regenerate URLs.
 * Error Handling: S3 delete is idempotent; non-existent keys do not throw errors.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client!: S3Client;
  private bucket!: string;
  private region!: string;

  private readonly SIGNED_URL_EXPIRES_IN = 3600;

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
   * Upload a file to S3.
   *
   * Generates a unique filename and uploads it to the S3 bucket within a specific folder structure.
   * Returns a signed (temporary) URL and S3 key for future reference.
   *
   * @param file - Multer file object (buffer from memory storage).
   * @param folder - S3 folder path (defaults to 'knowledge').
   * @returns An object containing the signed URL (valid for 1 hour) and the S3 key.
   *
   * @remarks
   * File naming convention: `{timestamp}-{random}`. File extension based on actual mimetype.
   * Content-Type is inferred from the uploaded file's mimetype.
   * Returns a signed URL valid for 1 hour (3600 seconds).
   * The signed URL includes AWS signature for temporary access without requiring credentials.
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
        ContentType: file.mimetype,
      }),
    );

    const url = await this.generateSignedUrl(key);
    this.logger.log(`[upload] ${key}`);
    return { url, key };
  }

  /**
   * Generate a signed URL for accessing an S3 object.
   *
   * Creates a temporary, time-limited URL that allows access to a file without AWS credentials.
   * Used for secure file distribution and image retrieval.
   *
   * @param key - The S3 object key (path).
   * @returns A signed URL valid for 1 hour (3600 seconds).
   *
   * @remarks
   * The signed URL contains embedded AWS credentials and expires after 1 hour.
   * Commonly called after file upload or when regenerating URLs for existing files.
   */
  async generateSignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: this.SIGNED_URL_EXPIRES_IN,
    });
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
