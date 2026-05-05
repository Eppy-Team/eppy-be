import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';

/**
 * Storage Module
 *
 * Infrastructure module for AWS S3 file storage operations.
 * Provides an abstraction layer for S3 client initialization and file-related tasks.
 *
 * Exports:
 * - StorageService: Handles S3 operations such as file uploads and deletions.
 *
 * Dependencies:
 * - ConfigModule: Manages AWS credentials and bucket configuration settings.
 *
 * Environment variables required:
 * - AWS_S3_BUCKET_NAME
 * - AWS_REGION
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 */
@Module({
  imports: [ConfigModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
