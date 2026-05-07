import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatRepository } from './chat.repository';
import { AiModule } from '../ai/ai.module';
import { ConversationModule } from '../conversation/conversation.module';
import { StorageModule } from 'src/storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Chat Module
 *
 * Orchestrates user messaging and AI-driven conversation workflows with multimodal support.
 * Manages message persistence, context retrieval, and RAG (Retrieval-Augmented Generation)
 * integration for intelligent, context-aware responses.
 *
 * Architecture & Responsibility Separation:
 * - ConversationModule: Session metadata (titles, participants, ownership).
 * - ChatModule: Message content (persistence, AI inference, audit trails).
 * - AiModule: LLM and vector search capabilities for RAG pipeline.
 * - StorageModule: S3 file management for images and documents.
 *
 * @remarks
 * Multimodal Support: Handles text messages with optional image attachments.
 * Each message is persisted with role (USER/ASSISTANT), content, and optional image metadata.
 */
@Module({
  imports: [
    AiModule, 
    ConversationModule,
    StorageModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService, 
    ChatRepository, 
    PrismaService
  ],
})
export class ChatModule {}