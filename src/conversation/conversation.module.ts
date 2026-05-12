import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationRepository } from './conversation.repository';
import { StorageModule } from '../storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Conversation Module
 *
 * Manages conversation lifecycle: creation, retrieval, and message history browsing.
 * Enforces strict user data isolation through ownership-based access control.
 *
 * Architecture & Integration:
 * - Responsible for: Session metadata (titles, creation dates, participants).
 * - Delegates to ChatModule: Message creation, AI inference, message management.
 * - Uses StorageModule: For signed URL regeneration on historical messages with images.
 *
 * Exports:
 * - ConversationRepository: Made available to ChatModule for cross-feature integration.
 *
 * @remarks
 * Separation of Concerns: This module is the 'session shell'; ChatModule is the 'content engine'.
 */
@Module({
  imports: [StorageModule],
  controllers: [ConversationController],
  providers: [ConversationService, ConversationRepository, PrismaService],
  exports: [ConversationRepository],
})
export class ConversationModule {}
