import { Injectable } from '@nestjs/common';
import { MessageFeedback, MessageRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Chat Repository
 *
 * Data Access Layer (DAL) for message persistence and retrieval within conversations.
 * Optimizes for fast context windowing and immutable audit trails using strict role separation.
 *
 * @remarks
 * Design Principles:
 * - Role Separation: Enforces USER and ASSISTANT message types (enum-based).
 * - Immutability: Messages are append-only; updates are discouraged by design.
 * - Context Windowing: Fetches recent messages efficiently for LLM context.
 * - Multimodal Support: Stores image metadata (URL + S3 key) alongside text content.
 */
@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch the most recent N messages from a conversation in chronological order.
   *
   * Retrieves a window of messages for RAG context. Uses a 'fetch-desc-then-reverse'
   * pattern to efficiently get the latest messages while maintaining correct order.
   *
   * @param conversationId - Unique identifier of the conversation.
   * @param limit - Number of messages to retrieve (default: 10).
   * @returns Chronological message array (oldest to newest) with id, role, content.
   *
   * @remarks
   * Context Window: Typical limit is 10 for efficient RAG context retrieval.
   * Ordering: Always returns messages in ascending order (oldest → newest) for LLM consumption.
   * Performance: Uses `take` to prevent memory overflow on long conversations.
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

    return messages.reverse();
  }

  /**
   * Retrieve a single message by its ID with feedback metadata.
   *
   * Fetches message details including role, conversation association, and any submitted feedback.
   * Used for validation and feedback submission checks.
   *
   * @param id - Unique message identifier (UUID).
   * @returns Message entity with id, role, conversationId, and feedback status, or null if not found.
   *
   * @remarks
   * Feedback Status: The `feedback` field can be null (no feedback), THUMBS_UP, or THUMBS_DOWN.
   * Conversation Validation: Returns conversationId to enable cross-conversation validation.
   * Query Performance: Uses direct ID lookup for O(1) retrieval.
   */
  async findMessageById(id: string) {
    return this.prisma.message.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        conversationId: true,
        feedback: true,
      },
    });
  }

  /**
   * Persist an incoming user message with optional image metadata.
   *
   * Captures user input and optional multimodal attachments (image URL + S3 key)
   * before AI processing. Stores both the signed URL and key for future regeneration.
   *
   * @param data - Message payload: conversationId, content, and optional imageUrl/imageKey.
   * @returns Saved message entity with id, role, content, imageUrl, and createdAt timestamp.
   *
   * @remarks
   * Image Storage: Both `imageUrl` (signed URL) and `imageKey` (S3 path) are persisted.
   * The key allows regenerating fresh signed URLs when retrieving old messages.
   */
  async saveUserMessage(data: {
    conversationId: string;
    content: string;
    imageUrl?: string;
    imageKey?: string;
  }) {
    return this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        role: MessageRole.USER,
        content: data.content,
        imageUrl: data.imageUrl ?? null,
        imageKey: data.imageKey ?? null,
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
   * Persist a generated AI response with quality metrics.
   *
   * Records the assistant's synthesized output and confidence score from the RAG engine.
   * Enables post-hoc quality audits and analytics on response reliability.
   *
   * @param data - AI response bundle: conversationId, content, and confidenceScore.
   * @returns Saved assistant message with id, role, content, confidenceScore, and createdAt.
   *
   * @remarks
   * Confidence Score: Range [0, 1]. Lower values indicate uncertainty or fallback responses.
   * Used for quality monitoring and user-facing indicators (e.g., confidence badges).
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

  /**
   * Persist user feedback for an AI-generated message.
   *
   * Records the user's quality assessment (THUMBS_UP or THUMBS_DOWN) on an assistant response.
   * Enables quality tracking and model improvement via feedback analytics.
   *
   * @param messageId - Unique identifier of the assistant message being evaluated.
   * @param feedback - Feedback value: THUMBS_UP or THUMBS_DOWN (from MessageFeedback enum).
   * @returns Updated message with id and feedback fields.
   *
   * @remarks
   * Immutable Feedback: Once submitted, feedback cannot be changed (service layer enforces this).
   * Audit Trail: Feedback updates include automatic timestamps via Prisma defaults.
   * One Feedback Per Message: Database constraints prevent multiple feedback submissions per message.
   */
  async submitFeedback(messageId: string, feedback: MessageFeedback) {
    return this.prisma.message.update({
      where: { id: messageId },
      data: { feedback },
      select: {
        id: true,
        feedback: true,
      },
    });
  }
}
