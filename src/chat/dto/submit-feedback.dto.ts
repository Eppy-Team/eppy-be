import { IsEnum, IsNotEmpty } from 'class-validator';
import { MessageFeedback } from '@prisma/client';

/**
 * Submit Feedback DTO
 *
 * Request payload for submitting user quality feedback on AI-generated messages.
 * Encapsulates the user's assessment (THUMBS_UP or THUMBS_DOWN) for response reliability tracking.
 *
 * @remarks
 * Validation:
 * - feedback: Must be a valid MessageFeedback enum value (THUMBS_UP or THUMBS_DOWN).
 * - feedback: Must not be empty/null.
 *
 * Used By:
 * - ChatController.submitFeedback(): Receives feedback from client and passes to service layer.
 * - ChatService.submitFeedback(): Validates and processes feedback submission.
 */
export class SubmitFeedbackDto {
  /**
   * User's quality assessment for the AI response.
   *
   * Indicates whether the assistant's message was helpful and accurate.
   *
   * @type {MessageFeedback} - Enum with values: THUMBS_UP | THUMBS_DOWN
   * @example "THUMBS_UP"
   *
   * @remarks
   * Immutable: Once submitted, cannot be changed or revoked (enforced at service layer).
   * One Per Message: Database constraints prevent multiple feedback submissions per assistant message.
   * Impact: Used for quality metrics, model improvement, and confidence score validation.
   */
  @IsEnum(MessageFeedback)
  @IsNotEmpty()
  feedback!: MessageFeedback;
}