import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ChatRepository } from './chat.repository';
import { ConversationRepository } from '../conversation/conversation.repository';
import { AiService } from '../ai/ai.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatHistoryItem } from '../ai/dto/chat-request.dto';

/**
 * Chat Service
 * * The central orchestrator for the AI-powered conversation engine.
 * This service coordinates the lifecycle of a message, from user authorization 
 * and input persistence to RAG-based AI inference and response delivery.
 *
 * @remarks
 * Design Patterns:
 * - Orchestration: Bridges data persistence with external AI microservices.
 * - Fault Tolerance: Implements graceful degradation when the AI service is unreachable.
 * - Context Management: Maintains a rolling window of message history for stateless AI models.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly aiService: AiService,
  ) {}

  /**
   * Orchestrates the complete message processing workflow.
   * * Validates ownership, captures user intent, retrieves context, and synthesizes 
   * an AI response using Retrieval-Augmented Generation (RAG).
   *
   * @param conversationId - The target conversation session UUID.
   * @param userId - The ID of the requester (used for authorization checks).
   * @param dto - Validated message payload including optional multimodal context.
   * @returns A structured response containing both participant messages and knowledge sources.
   * @throws {NotFoundException} If the session does not exist or access is unauthorized.
   */
  async sendMessage(
    conversationId: string,
    userId: string,
    dto: SendMessageDto,
  ) {
    // 1. Authorization: Ensure the conversation belongs to the requesting user
    const conversation = await this.conversationRepository.findById(
      conversationId,
      userId,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // 2. Immediate Persistence: Save user message first to preserve audit trail
    const userMessage = await this.chatRepository.saveUserMessage({
      conversationId,
      content: dto.content,
      imageUrl: dto.imageUrl,
    });

    // 3. Context Preparation: Retrieve the rolling history window (last 10 messages)
    const recentMessages = await this.chatRepository.findRecentMessages(
      conversationId,
      10,
    );

    // Filter out current message to avoid redundancy in history context
    const history: ChatHistoryItem[] = recentMessages
      .filter((m) => m.id !== userMessage.id)
      .map((m) => ({
        role: m.role.toLowerCase() as 'user' | 'assistant',
        content: m.content,
      }));

    // Default response for graceful degradation
    let aiAnswer =
      'Maaf, sistem sedang tidak tersedia. Silakan coba beberapa saat lagi atau hubungi tim support.';
    let confidenceScore = 0;
    let sources: any[] = [];

    // 4. AI Inference: Attempt to generate a response via RAG
    try {
      const aiResponse = await this.aiService.chat({
        conversation_id: conversationId,
        content: dto.content,
        image_url: dto.imageUrl ?? null,
        history,
      });

      aiAnswer = aiResponse.answer;
      confidenceScore = aiResponse.confidence_score;
      sources = aiResponse.sources;
    } catch (error) {
      // Log the specific failure but do not crash the user request flow
      this.logger.error(
        `[sendMessage] AI Service failure for session ${conversationId}`,
        error instanceof Error ? error.message : String(error),
      );
    }

    // 5. Finalize: Persist the AI-generated response (or the fallback message)
    const assistantMessage = await this.chatRepository.saveAssistantMessage({
      conversationId,
      content: aiAnswer,
      confidenceScore,
    });

    return {
      message: 'Message sent successfully',
      data: {
        userMessage,
        assistantMessage,
        sources,
      },
    };
  }
}