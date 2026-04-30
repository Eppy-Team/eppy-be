import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Respond Ticket DTO
 *
 * Defines the schema and validation constraints for submitting an admin response to a ticket.
 * This DTO ensures that the response payload is structurally sound before reaching the service layer.
 *
 * @remarks
 * Validation Strategy:
 * - Enforces required response content to prevent empty submissions.
 * - Type validation ensures string-based content.
 */
export class RespondTicketDto {
  /**
   * The administrator's response message to the support ticket.
   *
   * This message is persisted and visible to the ticket creator, providing
   * the resolution or explanation for the escalated issue.
   *
   * @constraints
   * - Must be a non-empty string.
   * - No maximum length enforced (allows detailed explanations).
   *
   * @example "Thank you for reporting this issue. Our AI team has reviewed the case and we're implementing a fix. You'll receive updates within 24 hours."
   */
  @IsString()
  @IsNotEmpty()
  adminResponse!: string;
}