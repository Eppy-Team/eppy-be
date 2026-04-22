import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Conversation Repository
 *
 * Data Access Layer for conversation and message entities.
 * Encapsulates all database interactions using Prisma ORM, ensuring 
 * strict data isolation and optimized query execution.
 *
 * Responsibilities:
 * - Persistent storage operations for conversations and messages.
 * - Ownership-based filtering for secure data access.
 * - Performance optimization via selective field loading.
 *
 * Dependencies:
 * - PrismaService: Core database client.
 */
@Injectable()
export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve all conversations for a specific user with the latest message preview.
   *
   * @param userId - Unique identifier of the conversation owner.
   * @returns A list of conversations including metadata and the most recent message.
   *
   * @remarks
   * - Optimization: Uses `select` to fetch only required fields (id, title, createdAt).
   * - Sub-query: Fetches only the single latest message using `take: 1` and `orderBy`.
   * - Sorting: Results are ordered by `createdAt` in descending order (newest first).
   */
  async findAllByUserId(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });
  }

  /**
   * Find a single conversation by ID with explicit ownership verification.
   *
   * @param id - The conversation UUID.
   * @param userId - The owner's UUID to verify access rights.
   * @returns The conversation object or null if not found/unauthorized.
   *
   * @remarks
   * This method acts as a security gate by filtering by both ID and UserID 
   * at the database level to prevent ID-guessing attacks.
   */
  async findById(id: string, userId: string) {
    return this.prisma.conversation.findFirst({
      where: { id, userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });
  }

  /**
   * Fetch the chronological message history for a specific conversation.
   *
   * Performs a two-step verification process to ensure the requesting user 
   * owns the target conversation before retrieving its messages.
   *
   * @param conversationId - The target conversation UUID.
   * @param userId - The user ID for authorization.
   * @returns An array of messages or null if the conversation access is denied.
   *
   * @remarks
   * - Data Integrity: Messages are sorted in ascending order (`asc`) for chronological display.
   * - Rich Metadata: Includes extended fields like `imageUrl` and `confidenceScore`.
   * - Error Handling: Returns null to allow the service layer to handle 404/403 logic.
   */
  async findMessages(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });

    if (!conversation) return null;

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        imageUrl: true,
        confidenceScore: true,
        createdAt: true,
      },
    });
  }

  /**
   * Persist a new conversation record.
   *
   * @param data - Payload containing the owner's userId and conversation title.
   * @returns The newly created conversation object with essential fields.
   *
   * @remarks
   * - Automations: `id` and `createdAt` are handled via Prisma's default values.
   * - Return Value: Restricts returned fields to exclude internal database noise.
   */
  async create(data: { userId: string; title: string }) {
    return this.prisma.conversation.create({
      data: {
        userId: data.userId,
        title: data.title,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });
  }
}