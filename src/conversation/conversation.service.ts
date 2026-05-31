import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConversationRepository } from './conversation.repository';
import { StorageService } from '../storage/storage.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

/**
 * Conversation Service
 *
 * Business logic for conversation lifecycle: creation, listing, and message retrieval.
 * Ensures strict user data isolation and handles image URL regeneration for historical messages.
 *
 * Key Responsibilities:
 * - Conversation CRUD operations with ownership-based access control.
 * - Message history retrieval with automatic signed URL regeneration for image attachments.
 * - User-scoped query filtering to prevent cross-user data leakage.
 *
 * Dependencies:
 * - ConversationRepository: Message and conversation persistence.
 * - StorageService: Signed URL generation for image retrieval (valid for 1 hour).
 */
@Injectable()
export class ConversationService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Retrieve all conversations belonging to a specific user.
   *
   * Fetches conversation records including a preview of the most recent message.
   * Results are typically sorted by the repository in descending order.
   *
   * @param userId - Unique identifier of the authenticated user.
   * @returns A structured response containing the message and conversation data.
   *
   * @remarks
   * Query optimization is handled at the repository level by selecting
   * only necessary fields for the last message preview.
   */
  async findAll(userId: string) {
    const conversations =
      await this.conversationRepository.findAllByUserId(userId);

    return {
      message: 'Conversations retrieved',
      data: conversations,
    };
  }

  /**
   * Retrieve the complete message history for a specific conversation.
   *
   * Validates conversation ownership before returning data to prevent unauthorized access.
   * Regenerates fresh signed URLs for any messages with image attachments.
   *
   * @param conversationId - UUID of the target conversation.
   * @param userId - ID of the user requesting the data (for authorization).
   * @returns Chronological message history with fresh signed URLs for images.
   * @throws {NotFoundException} If the conversation does not exist or is not owned by the user.
   *
   * @remarks
   * URL Regeneration: For each message with an `imageKey`, a new signed URL is generated
   * (1 hour validity). This ensures that image links never expire during user sessions.
   * The `imageKey` field is stripped from responses for security; only the `imageUrl` is returned.
   * Operations are parallelized for performance.
   */
  async findMessages(conversationId: string, userId: string, isAdmin = false) {
    const messages = await this.conversationRepository.findMessages(
      conversationId,
      userId,
      isAdmin,
    );

    if (!messages) {
      throw new NotFoundException('Conversation not found');
    }

    const messagesWithFreshUrls = await Promise.all(
      messages.map(async (message) => {
        if (message.imageKey) {
          const freshUrl = await this.storageService.generateSignedUrl(
            message.imageKey,
          );
          return { ...message, imageUrl: freshUrl, imageKey: undefined };
        }
        return { ...message, imageKey: undefined };
      }),
    );

    return {
      message: 'Messages retrieved successfully',
      data: messagesWithFreshUrls,
    };
  }

  /**
   * Initialize a new conversation thread for a user.
   *
   * @param dto - Object containing the initial conversation title.
   * @param userId - ID of the user creating the conversation.
   * @returns The created conversation record.
   *
   * @remarks
   * Initial State: Conversations are created as empty threads.
   * Subsequent messages are handled by the messaging service/module.
   */
  async create(dto: CreateConversationDto, userId: string) {
    const conversation = await this.conversationRepository.create({
      userId,
      title: dto.title,
    });

    return {
      message: 'Conversation created',
      data: conversation,
    };
  }

  /**
   * Search conversations by message content within a user's conversation history.
   *
   * Performs full-text search across all messages within a user's conversations,
   * returning matching conversations with pagination and metadata about matches.
   * Validates keyword length and enforces user data isolation.
   *
   * @param data - Search parameters object.
   * @param data.userId - ID of the authenticated user (for ownership verification).
   * @param data.keyword - Search term (minimum 2 characters, case-insensitive).
   * @param data.page - Page number for pagination (1-indexed, default: 1).
   * @param data.limit - Number of results per page (default: 10).
   * @returns Paginated search results with match metadata and total count.
   * @throws {BadRequestException} If keyword is empty or less than 2 characters.
   *
   * @remarks
   * Flow:
   * [STEP 1] Validate keyword is not empty or whitespace-only.
   * [STEP 2] Validate keyword has minimum length of 2 characters.
   * [STEP 3] Query repository for conversations matching keyword in messages.
   * [STEP 4] Map results to include match count and preview of last matched message.
   * [STEP 5] Return paginated results with total count and metadata.
   *
   * Search Strategy:
   * - Case-insensitive substring matching across message content.
   * - Searches within conversations owned by the authenticated user only.
   * - Returns latest matching message per conversation as preview.
   * - Preview truncates to 150 characters with ellipsis if longer.
   * - Results include pagination metadata (totalPages, total, page, limit).
   *
   * Performance:
   * - Uses database-level filtering for efficient large-scale searches.
   * - Pagination prevents memory exhaustion on large result sets.
   * - Single database roundtrip for both data and count via Promise.all.
   *
   * Data Isolation:
   * - All results strictly filtered by authenticated userId.
   * - Prevents cross-user data leakage.
   */
  async search(data: {
    userId: string;
    keyword: string;
    page: number;
    limit: number;
  }) {
    const { userId, keyword, page, limit } = data;

    if (!keyword || keyword.trim().length === 0) {
      throw new BadRequestException('Search keyword cannot be empty');
    }

    if (keyword.trim().length < 2) {
      throw new BadRequestException(
        'Search keyword must be at least 2 characters',
      );
    }

    const { conversations, total } =
      await this.conversationRepository.searchConversations({
        userId,
        keyword: keyword.trim(),
        page,
        limit,
      });

    const results = conversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      matchCount: conv.messages.length,
      lastMatchedMessage: conv.messages[0]
        ? {
            id: conv.messages[0].id,
            role: conv.messages[0].role,
            preview:
              conv.messages[0].content.slice(0, 150) +
              (conv.messages[0].content.length > 150 ? '...' : ''),
            createdAt: conv.messages[0].createdAt,
          }
        : null,
    }));

    return {
      message: `Found ${total} conversation(s) matching "${keyword.trim()}"`,
      data: results,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        keyword: keyword.trim(),
      },
    };
  }
}
