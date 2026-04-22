import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * Create Conversation DTO
 * * Defines the data structure and validation rules for creating a new conversation.
 * Ensures data integrity before reaching the service layer.
 */
export class CreateConversationDto {
  /**
   * The display title for the conversation.
   * Used for identification in the user interface conversation list.
   * * @example "Project Eppy - Backend Discussion"
   * @constraints 
   * - Must be a string.
   * - Cannot be empty or whitespace.
   * - Maximum length of 100 characters for storage efficiency.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;
}