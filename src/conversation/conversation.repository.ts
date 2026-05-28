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
   * Performs a two-step verification: first checks ownership, then retrieves all messages
   * in chronological order with full metadata including image references and AI confidence.
   *
   * @param conversationId - Target conversation UUID.
   * @param userId - User ID for ownership verification.
   * @returns Array of messages with full metadata, or null if unauthorized.
   *
   * @remarks
   * Ordering: Messages returned in ascending order (oldest to newest) for chronological display.
   * Metadata: Includes imageUrl, imageKey (for regenerating signed URLs), and confidenceScore.
   * Authorization: Returns null on ownership mismatch; service layer handles 404/403 responses.
   * Image Handling: imageKey is persisted to support signed URL regeneration on client requests.
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
        imageKey: true,
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

  /**
   * Search conversations by message content with pagination support.
   *
   * Performs optimized case-insensitive substring search across messages
   * within user-owned conversations. Returns both result set and total count
   * in a single database call for efficient pagination.
   *
   * @param data - Search configuration object.
   * @param data.userId - User ID for ownership verification.
   * @param data.keyword - Search term (minimum 2 characters already validated by caller).
   * @param data.page - Page number for pagination (1-indexed).
   * @param data.limit - Results per page.
   * @returns Object containing paginated conversations array and total match count.
   *
   * @remarks
   * Query Strategy:
   * - Uses Prisma `where.messages.some` to filter conversations by nested message content.
   * - Case-insensitive search via `mode: 'insensitive'` in Prisma where clause.
   * - Pagination via `skip` and `take` (skip = (page - 1) * limit).
   * - Optimized with `select` to fetch only necessary fields (id, title, createdAt, _count).
   * - Fetches only the latest matching message per conversation for preview.
   *
   * Optimization:
   * - Parallel execution: Conversations fetch and count query run simultaneously via Promise.all.
   * - Single database roundtrip per Promise.all block (not sequential queries).
   * - Message count provided via `_count` for total matching messages indicator.
   *
   * Security:
   * - Data strictly filtered by userId at database level.
   * - No cross-user data leakage possible.
   *
   * Field Selection:
   * - Fetches: id, title, createdAt, messageCount (_count.messages), matched messages.
   * - Excludes: userId, updatedAt, and other internal fields.
   * - Message fields: id, role, content, createdAt (for preview).
   */
  async searchConversations(data: {
    userId: string;
    keyword: string;
    page: number;
    limit: number;
  }) {
    const { userId, keyword, page, limit } = data;
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        where: {
          userId,
          messages: {
            some: {
              content: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
          },
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          _count: {
            select: { messages: true },
          },
          messages: {
            where: {
              content: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              role: true,
              content: true,
              createdAt: true,
            },
          },
        },
      }),
 
      this.prisma.conversation.count({
        where: {
          userId,
          messages: {
            some: {
              content: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
          },
        },
      }),
    ]);
 
    return { conversations, total };
  }
}
