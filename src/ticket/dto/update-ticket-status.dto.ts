import { IsEnum, IsNotEmpty } from 'class-validator';
import { TicketStatus } from '@prisma/client';

/**
 * Update Ticket Status DTO
 *
 * Defines the schema and validation constraints for updating ticket workflow status.
 * This DTO ensures that only valid status transitions are submitted to the service layer.
 *
 * @remarks
 * Validation Strategy:
 * - Enforces enum constraint to prevent invalid status values.
 * - Leverages Prisma-generated enum for type safety and consistency.
 */
export class UpdateTicketStatusDto {
  /**
   * The new workflow status for the ticket.
   *
   * Represents the current stage of the support ticket lifecycle (OPEN → IN_PROGRESS → RESOLVED).
   *
   * @constraints
   * - Must be a valid TicketStatus enum value.
   * - Cannot be empty.
   *
   * @example "IN_PROGRESS"
   */
  @IsEnum(TicketStatus)
  @IsNotEmpty()
  status!: TicketStatus;
}