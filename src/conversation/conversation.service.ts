import { Injectable, NotFoundException } from '@nestjs/common';
import { ConversationRepository } from './conversation.repository';
import { CreateConversationDto } from './dto/create-conversation.dto';

/**
 * Conversation Service
 *
 * Provides business logic for managing chat histories and message retrieval.
 * Acts as an orchestrator between the API layer and the data access layer,
 * ensuring strict user data isolation and ownership validation.
 *
 * Dependencies:
 * - ConversationRepository: Handles database interactions.
 */
@Injectable()
export class ConversationService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
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
    const conversations = await this.conversationRepository.findAllByUserId(userId);

    return {
      message: 'Conversations retrieved',
      data: conversations,
    };
  }

  /**
   * Retrieve the complete message history for a specific conversation.
   *
   * Validates conversation ownership before returning data to prevent 
   * unauthorized access across user accounts.
   *
   * @param conversationId - UUID of the target conversation.
   * @param userId - ID of the user requesting the data (for authorization).
   * @returns Chronological message history for the conversation.
   * @throws {NotFoundException} If the conversation does not exist or is not owned by the user.
   *
   * @remarks
   * Authorization: The repository enforces ownership by filtering queries with both ID and userId.
   */
  async findMessages(conversationId: string, userId: string) {
    const messages = await this.conversationRepository.findMessages(
      conversationId,
      userId,
    );

    if (!messages) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      message: 'Messages retrieved',
      data: messages,
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
}