import { Injectable, NotFoundException } from '@nestjs/common';
import { ConversationRepository } from './conversation.repository';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Injectable()
export class ConversationService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  async findAll(userId: string) {
    const conversations =
      await this.conversationRepository.findAllByUserId(userId);

    return {
      message: 'Conversations retrieved',
      data: conversations,
    };
  }

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