import {
  Controller,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/get-user.decorator';
import { Multer } from 'multer';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';

const imageUploadOptions = {
  storage: memoryStorage(),
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(
        new BadRequestException('Hanya file JPG, PNG, atau WEBP yang diizinkan'),
        false,
      );
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
};

/**
 * Chat Controller
 * * Provides secure endpoints for message submission and real-time AI interactions.
 * All operations within this controller are user-scoped and session-aware.
 *
 * @security JWT Bearer Authentication
 * @remarks
 * Every endpoint in this controller is protected by `JwtAuthGuard`. 
 * Unauthorized requests will result in a 401 response before reaching any handler.
 */
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Submit a message with optional image and retrieve AI response.
   *
   * Acts as the primary entry point for the RAG engine. Accepts user prompts and optional
   * multimodal context (images), processes them through the AI pipeline, and returns a
   * synthesized response with citations and image analysis results.
   *
   * @param conversationId - UUID of the target conversation (validated for ownership).
   * @param userId - Authenticated user ID (from JWT token via `@CurrentUser`).
   * @param dto - Message payload containing text content.
   * @param file - Optional image file (JPG/PNG/WEBP, max 5MB).
   * @returns Response containing user message, assistant message, sources, and image analyses.
   *
   * @status 201 Created
   * @throws {NotFoundException} If conversation ID is invalid or doesn't belong to the user.
   * @throws {BadRequestException} If image MIME type is unsupported or file size exceeds 5MB.
   *
   * @example
   * POST /conversations/550e8400-e29b-41d4-a716-446655440000/messages
   * Body: { "content": "What does this image show?" }
   * File: image.jpg
   */
   @Post(':id/messages')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  async sendMessage(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.chatService.sendMessage(conversationId, userId, dto, file);
  }

   @Patch(':id/messages/:messageId/feedback')
  async submitFeedback(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.chatService.submitFeedback(conversationId, messageId, userId, dto);
  }
}