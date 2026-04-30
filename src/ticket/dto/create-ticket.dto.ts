import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';

/**
 * Create Ticket DTO
 *
 * Defines the schema and validation constraints for initiating a new support ticket.
 * This DTO ensures that the ticket payload is structurally sound and linked to valid
 * conversation and message entities before reaching the service layer.
 *
 * @remarks
 * Validation Strategy:
 * - Enforces UUID format for relational references (conversation, message).
 * - Validates required fields (title, description) with appropriate length constraints.
 * - Type coercion is handled by class-validator decorators.
 */
export class CreateTicketDto {
  /**
   * The UUID of the conversation from which the ticket is being escalated.
   *
   * This ensures the ticket maintains context about which conversation session
   * prompted the escalation.
   *
   * @constraints
   * - Must be a valid UUID (v4).
   * - Cannot be empty.
   * - The conversation must exist and belong to the authenticated user.
   *
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  @IsUUID()
  @IsNotEmpty()
  conversationId!: string;

  /**
   * The UUID of the specific message within the conversation.
   *
   * This creates a direct link to the AI response or user input that prompted escalation,
   * allowing admins to see exactly what issue is being reported.
   *
   * @constraints
   * - Must be a valid UUID (v4).
   * - Cannot be empty.
   * - The message must exist within the specified conversation.
   * - Only one ticket per message is allowed (duplicate prevention).
   *
   * @example "550e8400-e29b-41d4-a716-446655440001"
   */
  @IsUUID()
  @IsNotEmpty()
  messageId!: string;

  /**
   * Brief summary of the support issue.
   *
   * Used as the primary ticket subject in list views and admin dashboards.
   *
   * @constraints
   * - Must be a non-empty string.
   * - Maximum length of 100 characters for display efficiency.
   *
   * @example "AI Response Inaccuracy"
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  /**
   * Detailed explanation of the issue.
   *
   * Provides context and details that help admins understand the problem and
   * formulate an appropriate response.
   *
   * @constraints
   * - Must be a non-empty string.
   *
   * @example "The system provided incorrect information about the project timeline. Escalating for review."
   */
  @IsString()
  @IsNotEmpty()
  description!: string;
}