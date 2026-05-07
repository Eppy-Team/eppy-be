import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

/**
 * Send Message DTO
 * * Defines the schema and validation constraints for outgoing chat messages.
 * This DTO ensures that the message payload is structurally sound before 
 * being processed by the RAG orchestration layer.
 *
 * @remarks
 * Supports multimodal interactions by allowing optional image attachments
 * alongside the primary text content.
 */
export class SendMessageDto {
  /**
   * The text-based content of the user's message.
   * * This serves as the primary prompt for the AI inference engine.
   * * @example "Bagaimana cara mengajukan cuti di perusahaan ini?"
   */
  @IsString({ message: 'Message content must be a valid string' })
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  content!: string;
}