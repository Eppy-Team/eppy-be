import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationRepository } from './conversation.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Conversation Module
 *
 * A feature module dedicated to conversation history management.
 * Provides a structured REST API for managing user-specific chat sessions 
 * and retrieving chronological message logs.
 *
 * @remarks
 * Design Strategy:
 * This module follows a strict Separation of Concerns (SoC) principle. 
 * While it handles retrieval and metadata management, the actual message 
 * generation and AI orchestration are delegated to the ChatModule.
 *
 * Exports:
 * - ConversationRepository: Exported to allow integration with ChatModule 
 * for cross-module data persistence.
 *
 * Dependencies:
 * - PrismaService: Provides centralized database connectivity.
 */
@Module({
  controllers: [ConversationController],
  providers: [ConversationService, ConversationRepository, PrismaService],
  exports: [ConversationRepository],
})
export class ConversationModule {}