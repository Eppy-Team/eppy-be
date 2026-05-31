import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/get-user.decorator';

/**
 * Conversation Controller
 *
 * Handles HTTP requests for conversation management and message retrieval.
 * All endpoints are protected and user-scoped to ensure data isolation.
 *
 * @see ConversationService for business logic implementation.
 */
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  /**
   * Retrieve a list of conversations for the authenticated user.
   *
   * Fetches conversations with a preview of the latest message,
   * sorted by creation date (newest first).
   *
   * @param userId - ID of the authenticated user (injected from JWT).
   * @returns A list of conversations with last message metadata.
   *
   * @remarks
   * Data Isolation: Only conversations owned by the authenticated user are returned.
   */
  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    return this.conversationService.findAll(userId);
  }

  /**
   * Search conversations by message content.
   *
   * Searches across all messages within a user's conversations and returns
   * matching conversations with pagination support. Each result includes a preview
   * of the most recent matching message and match metadata.
   *
   * @param userId - ID of the authenticated user (injected from JWT).
   * @param keyword - Search query term (minimum 2 characters, case-insensitive).
   * @param page - Page number for pagination (default: 1, 1-indexed).
   * @param limit - Number of results per page (default: 10).
   * @returns Paginated search results with conversation metadata and match previews.
   *
   * @remarks
   * Query Parameters:
   * - `q` (required): Search keyword, minimum 2 characters.
   * - `page` (optional): Page number for pagination, defaults to 1.
   * - `limit` (optional): Results per page, defaults to 10.
   *
   * Authorization:
   * - All endpoints are protected and user-scoped.
   * - Results only include conversations owned by the authenticated user.
   *
   * @example
   * GET /conversations/search?q=project&page=1&limit=10
   * Response:
   * {
   *   "message": "Found 3 conversation(s) matching \"project\"",
   *   "data": [
   *     {
   *       "id": "uuid",
   *       "title": "Project Discussion",
   *       "createdAt": "2026-05-20T10:00:00Z",
   *       "matchCount": 2,
   *       "lastMatchedMessage": {
   *         "id": "uuid",
   *         "role": "user",
   *         "preview": "We discussed the project requirements...",
   *         "createdAt": "2026-05-20T12:30:00Z"
   *       }
   *     }
   *   ],
   *   "meta": {
   *     "total": 3,
   *     "page": 1,
   *     "limit": 10,
   *     "totalPages": 1,
   *     "keyword": "project"
   *   }
   * }
   */
  @Get('search')
  async search(
    @CurrentUser('id') userId: string,
    @Query('q') keyword: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.conversationService.search({ userId, keyword, page, limit });
  }

  /**
   * Retrieve chronological message history for a specific conversation.
   *
   * @param id - UUID of the conversation.
   * @param userId - ID of the authenticated user (for ownership verification).
   * @returns Detailed message history sorted by date (oldest first).
   * * @throws {NotFoundException} If conversation is not found or access is denied.
   *
   * @remarks
   * Authorization is enforced at the repository/service level to ensure
   * the user only accesses their own conversation history.
   */
  @Get(':id/messages')
  async findMessages(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const isAdmin = role === 'ADMIN';
    return this.conversationService.findMessages(
      conversationId,
      userId,
      isAdmin,
    );
  }

  /**
   * Create a new conversation thread.
   *
   * Initializes an empty conversation with a user-defined title.
   *
   * @param dto - Data Transfer Object containing the conversation title.
   * @param userId - ID of the authenticated user (assigned as owner).
   * @returns The newly created conversation object.
   *
   * @example
   * POST /conversations
   * Body: { "title": "New Project Discussion" }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateConversationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.conversationService.create(dto, userId);
  }
}
