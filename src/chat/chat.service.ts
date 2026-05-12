import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { MessageFeedback, MessageRole } from '@prisma/client';
import { ChatRepository } from './chat.repository';
import { ConversationRepository } from '../conversation/conversation.repository';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { SendMessageDto } from './dto/send-message.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { ChatHistoryItem } from '../ai/dto/chat-request.dto';
import { ChatSource } from '../ai/dto/chat-response.dto';

/**
 * Chat Service
 *
 * Orchestrates the complete message flow: user input → S3 upload → AI processing → persistence.
 * Handles multimodal interactions (text + images), manages conversation context, and integrates
 * with the RAG (Retrieval-Augmented Generation) pipeline for intelligent responses.
 *
 * Dependencies:
 * - ChatRepository: Persists messages with roles and metadata.
 * - ConversationRepository: Validates conversation ownership and retrieves context.
 * - AiService: Executes RAG queries and generates responses.
 * - StorageService: Manages S3 file uploads and signed URLs.
 *
 * @remarks
 * Error Handling: Implements graceful degradation — if AI service fails,
 * a fallback message is returned and the flow completes normally.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly aiService: AiService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Send a message within a conversation and retrieve AI-generated response.
   *
   * Executes a complete RAG pipeline: validates ownership → uploads images → persists user message
   * → fetches context history → queries AI → saves assistant response → returns bundle.
   *
   * @param conversationId - UUID of the target conversation (validated against userId).
   * @param userId - Authenticated user's ID (from JWT token).
   * @param dto - Message payload containing text content.
   * @param imageFile - Optional image attachment (JPG/PNG/WEBP, max 5MB).
   * @returns Response object with user/assistant messages, citation sources, and image analysis.
   *
   * @status 201 Created
   * @throws {NotFoundException} If conversation doesn't exist or doesn't belong to the user.
   * @throws {BadRequestException} If image upload fails or DTO validation fails.
   *
   * @remarks
   * Flow:
   * 1. Verify conversation ownership to prevent cross-user access.
   * 2. Upload image to S3 (if provided) and store signed URL + key.
   * 3. Persist user message with image metadata.
   * 4. Fetch last 10 messages as RAG context.
   * 5. Query AI service with user prompt + image URL + history.
   * 6. On AI failure: gracefully degrade to fallback message (confidence=0).
   * 7. Persist AI response with confidence score.
   * 8. Return bundled response with sources and image analyses.
   */
  async sendMessage(
    conversationId: string,
    userId: string,
    dto: SendMessageDto,
    imageFile?: Express.Multer.File,
  ) {
    // [STEP 1] Verify conversation ownership to prevent cross-user access
    const conversation = await this.conversationRepository.findById(
      conversationId,
      userId,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    this.logger.debug(
      `[sendMessage] authorized user_id=${userId} conversation_id=${conversationId}`,
    );

    // [STEP 2] Upload image to S3 (if provided) and store signed URL + key
    let imageUrl: string | null = null;
    let imageKey: string | null = null;
    if (imageFile) {
      const uploaded = await this.storageService.upload(
        imageFile,
        'chat-images',
      );
      imageUrl = uploaded.url;
      imageKey = uploaded.key;
      this.logger.log(
        `[sendMessage] image uploaded to S3 key=${imageKey} conversation_id=${conversationId}`,
      );
    }

    // [STEP 3] Persist user message with image metadata
    const userMessage = await this.chatRepository.saveUserMessage({
      conversationId,
      content: dto.content,
      imageUrl: imageUrl ?? undefined,
      imageKey: imageKey ?? undefined,
    });
    this.logger.log(
      `[sendMessage] user message saved message_id=${userMessage.id} conversation_id=${conversationId}`,
    );

    // [STEP 4] Fetch last 10 messages as RAG context
    const recentMessages = await this.chatRepository.findRecentMessages(
      conversationId,
      10,
    );

    const history: ChatHistoryItem[] = recentMessages
      .filter((m) => m.id !== userMessage.id)
      .map((m) => ({
        role: m.role.toLowerCase() as 'user' | 'assistant',
        content: m.content,
      }));
    this.logger.debug(
      `[sendMessage] context history size=${history.length} conversation_id=${conversationId}`,
    );

    // [STEP 5-6] Query AI service with user prompt + image URL + history (with graceful fallback)
    let aiAnswer =
      'Maaf, sistem sedang tidak tersedia. Silakan coba beberapa saat lagi atau hubungi tim support.';
    let confidenceScore = 0;
    let sources: ChatSource[] = [];
    let imageAnalyses: string[] = [];

    try {
      // [STEP 5] Query AI service
      const aiResponse = await this.aiService.chat({
        conversation_id: conversationId,
        query: dto.content,
        image_url: imageUrl,
        history,
      });

      aiAnswer = aiResponse.answer;
      confidenceScore = aiResponse.confidence_score;
      sources = aiResponse.sources;
      imageAnalyses = aiResponse.image_analyses;
    } catch (error) {
      // [STEP 6] On AI failure: gracefully degrade to fallback message (confidence=0)
      this.logger.error(
        `[sendMessage] AI Service failure for session ${conversationId}`,
        error instanceof Error ? error.message : String(error),
      );
    }

    // [STEP 7] Persist AI response with confidence score
    const assistantMessage = await this.chatRepository.saveAssistantMessage({
      conversationId,
      content: aiAnswer,
      confidenceScore,
    });
    this.logger.log(
      `[sendMessage] assistant message saved message_id=${assistantMessage.id} confidence=${confidenceScore} sources=${sources.length} conversation_id=${conversationId}`,
    );

    // [STEP 8] Return bundled response with sources and image analyses
    return {
      message: 'Message sent successfully',
      data: {
        userMessage,
        assistantMessage,
        sources,
        imageAnalyses,
      },
    };
  }

  /**
   * Submit user feedback on an AI-generated message for quality evaluation.
   *
   * Validates feedback eligibility (assistant messages, no duplicate feedback) and persists
   * the user's quality assessment. Enables post-response quality tracking for model improvement.
   *
   * @param conversationId - UUID of the conversation containing the message.
   * @param messageId - UUID of the assistant message being evaluated.
   * @param userId - Authenticated user's ID (from JWT token).
   * @param dto - Feedback payload containing THUMBS_UP or THUMBS_DOWN value.
   * @returns Response object with updated message and feedback status.
   *
   * @status 200 OK
   * @throws {NotFoundException} If conversation doesn't belong to user or message not found.
   * @throws {BadRequestException} If message is not from assistant or feedback already submitted.
   *
   * @remarks
   * Flow:
   * 1. Verify conversation ownership to prevent cross-user feedback injection.
   * 2. Fetch message details and validate it belongs to the target conversation.
   * 3. Enforce feedback eligibility: message must be from ASSISTANT role.
   * 4. Prevent duplicate feedback: check if feedback already submitted for this message.
   * 5. Persist feedback with MessageFeedback enum value (THUMBS_UP or THUMBS_DOWN).
   * 6. Return success response with updated message feedback status.
   *
   * Immutability: Once submitted, feedback is final and cannot be changed or revoked.
   */
  async submitFeedback(
    conversationId: string,
    messageId: string,
    userId: string,
    dto: SubmitFeedbackDto,
  ) {
    // [STEP 1] Verify conversation ownership to prevent cross-user feedback injection
    const conversation = await this.conversationRepository.findById(conversationId, userId);
    if (!conversation) throw new NotFoundException('Conversation not found');
 
    // [STEP 2] Fetch message details and validate it belongs to the target conversation
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }
 
    // [STEP 3] Enforce feedback eligibility: message must be from ASSISTANT role
    if (message.role !== MessageRole.ASSISTANT) {
      throw new BadRequestException('Feedback hanya bisa diberikan untuk pesan dari asisten');
    }
 
    // [STEP 4] Prevent duplicate feedback: check if feedback already submitted for this message
    if (message.feedback !== null) {
      throw new BadRequestException('Feedback untuk pesan ini sudah pernah diberikan');
    }
 
    // [STEP 5] Persist feedback with MessageFeedback enum value (THUMBS_UP or THUMBS_DOWN)
    const updated = await this.chatRepository.submitFeedback(messageId, dto.feedback);
 
    // [STEP 6] Return success response with updated message feedback status
    return {
      message: 'Feedback submitted successfully',
      data: updated,
    };
  }
}
