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

  /**
   * Optional URL reference to an image attachment.
   * * Used for vision-capable AI tasks (e.g., analyzing screenshots or documents).
   * * @remarks
   * If provided, the URL must be publicly accessible for the AI service 
   * to fetch and process the image context.
   * * @example "https://storage.eppy.app/uploads/error-log.png"
   */
  @IsOptional()
  @IsString({ message: 'Image URL must be a valid string' })
  @IsUrl({}, { message: 'Image URL must be a valid and accessible URL' })
  imageUrl?: string;
}