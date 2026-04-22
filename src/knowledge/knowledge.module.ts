import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeRepository } from './knowledge.repository';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [AiModule, StorageModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeRepository, PrismaService],
})
export class KnowledgeModule {}