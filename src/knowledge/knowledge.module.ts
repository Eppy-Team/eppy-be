import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeRepository } from './knowledge.repository';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Knowledge Module
 *
 * Feature module for comprehensive knowledge base management.
 * Provides REST API endpoints for knowledge article CRUD operations,
 * integrated with file upload support and automatic AI-powered embedding.
 *
 * Exports:
 * - KnowledgeController: REST endpoints for article management.
 * - KnowledgeService: Core business logic and orchestration.
 * - KnowledgeRepository: Direct data access layer.
 *
 * Dependencies:
 * - AiModule: Facilitates embedding generation and vectorization.
 * - StorageModule: Handles S3 file storage operations.
 * - PrismaService: Provides underlying database access.
 */
@Module({
  imports: [AiModule, StorageModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeRepository, PrismaService],
})
export class KnowledgeModule {}
