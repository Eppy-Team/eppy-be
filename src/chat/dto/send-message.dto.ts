import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

/**
 * Send Message DTO
 *
 * Defines the schema and validation for user message content.
 * Represents the text portion of a chat message; image attachments are handled
 * separately by the controller's FileInterceptor.
 *
 * @remarks
 * Multimodal Support: While this DTO handles text, the ChatController supports
 * concurrent image uploads via `@UploadedFile()`. Both are processed together
 * in ChatService.sendMessage().
 */
export class SendMessageDto {
  /**
   * The text content of the user's message.
   *
   * Primary input for the RAG engine. Can include questions, requests, or context.
   * Cannot be empty or contain only whitespace.
   *
   * @example "Bagaimana cara mengajukan cuti di perusahaan ini?"
   */
  @IsString({ message: 'Message content must be a valid string' })
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  content!: string;
}