import { Injectable } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Chat Repository
 * * Data Access Layer (DAL) for managing chat message persistence.
 * This repository handles all low-level interactions with the message table, 
 * optimizing for fast retrieval of conversation history.
 *
 * @remarks
 * Data Integrity:
 * - Implements strict role separation (USER vs ASSISTANT).
 * - Enforces immutable audit trails; messages are appended, never modified.
 * - Optimized for RAG context windowing through selective field loading.
 */
@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch the most recent history for a conversation.
   * * Retrieves a specific number of messages in chronological order (oldest to newest).
   *
   * @param conversationId - The unique identifier of the chat session.
   * @param limit - Number of previous messages to include in the context window.
   * @returns A pruned list of messages containing only core content and roles.
   *
   * @remarks
   * Performance Strategy:
   * - Uses `take` to prevent memory overflow from long conversations.
   * - Employs a 'Fetch-Desc-then-Reverse' pattern to ensure we get the *latest* * messages but return them in the *correct order* for LLM consumption.
   */
  async findRecentMessages(conversationId: string, limit: number = 10) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
      },
    });

    // Reversing ensures the AI receives context in natural chronological order
    return messages.reverse();
  }

  /**
   * Persist an incoming user message.
   * * Captures user input and optional multimodal attachments before AI processing.
   *
   * @param data - The message payload including context and attachments.
   * @returns The saved message entity with generated metadata (ID, Timestamp).
   */
  async saveUserMessage(data: {
    conversationId: string;
    content: string;
    imageUrl?: string;
  }) {
    return this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        role: MessageRole.USER,
        content: data.content,
        imageUrl: data.imageUrl ?? null,
      },
      select: {
        id: true,
        role: true,
        content: true,
        imageUrl: true,
        createdAt: true,
      },
    });
  }

  /**
   * Persist a generated AI response.
   * * Records the assistant's output and the associated confidence metrics.
   *
   * @param data - The AI response and certainty metadata.
   * @returns The saved assistant message entity.
   * * @remarks
   * Confidence scores are persisted for future quality audits and 
   * analytics of the RAG engine performance.
   */
  async saveAssistantMessage(data: {
    conversationId: string;
    content: string;
    confidenceScore: number;
  }) {
    return this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        role: MessageRole.ASSISTANT,
        content: data.content,
        confidenceScore: data.confidenceScore,
      },
      select: {
        id: true,
        role: true,
        content: true,
        confidenceScore: true,
        createdAt: true,
      },
    });
  }
}