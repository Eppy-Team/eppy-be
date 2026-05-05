import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatRepository } from './chat.repository';
import { AiModule } from '../ai/ai.module';
import { ConversationModule } from '../conversation/conversation.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Chat Module
 * * A core feature module that orchestrates AI-driven messaging workflows.
 * It manages the exchange of messages within a conversation, integrating 
 * RAG capabilities to provide context-aware responses.
 *
 * @remarks
 * Architecture & Integration:
 * - AiModule: Consumed for its LLM and vector search capabilities.
 * - ConversationModule: Integrated to validate session lifecycle and ownership.
 *
 * Separation of Concerns:
 * While `ConversationModule` manages the 'shell' (metadata, titles, participants),
 * `ChatModule` is responsible for the 'content' (messages, AI inference, audit trails).
 */
@Module({
  imports: [
    AiModule, 
    ConversationModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService, 
    ChatRepository, 
    PrismaService
  ],
})
export class ChatModule {}