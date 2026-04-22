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
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.conversationService.findMessages(id, userId);
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