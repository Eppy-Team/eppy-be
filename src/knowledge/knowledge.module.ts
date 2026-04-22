import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeRepository } from './knowledge.repository';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Knowledge Module
 * * A core feature module that manages the system's knowledge base.
 * It encapsulates the entire lifecycle of a knowledge article—from 
 * initial PDF upload and cloud storage to AI-driven vector embedding.
 *
 * @remarks
 * Orchestration Logic:
 * This module acts as a bridge between the StorageModule (S3) and AiModule (Embeddings),
 * ensuring that database records, physical files, and vector representations 
 * remain synchronized.
 *
 * Dependencies:
 * - AiModule: Provides services for generating text embeddings and vector storage.
 * - StorageModule: Handles low-level AWS S3 file operations.
 * - PrismaService: Facilitates persistent storage in the relational database.
 */
@Module({
  imports: [AiModule, StorageModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeRepository, PrismaService],
})
export class KnowledgeModule {}