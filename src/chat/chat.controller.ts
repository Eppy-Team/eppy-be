import {
  Controller,
  Post,
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
   * Submit a new message and trigger AI inference.
   * * Acts as the primary entry point for the RAG engine. It accepts user prompts,
   * processes multimodal context, and returns a synthesized AI response.
   *
   * @param conversationId - The UUID of the specific conversation thread.
   * @param userId - Extracted automatically from the verified JWT payload.
   * @param dto - Validated message payload (Content + Optional Image).
   * @returns A bundle containing participant messages and factual citations.
   *
   * @status 201 Created
   * @throws {NotFoundException} If the conversation UUID is invalid or doesn't belong to the user.
   * @throws {BadRequestException} If the payload fails DTO validation (e.g., empty content).
   *
   * @example
   * POST /conversations/550e8400-e29b-41d4-a716-446655440000/messages
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
}