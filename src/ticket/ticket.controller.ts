import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { RespondTicketDto } from './dto/respond-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

/**
 * Ticket Management Controller
 * * Orchestrates the formal support lifecycle, from user escalation to admin resolution.
 * Handles issue tracking, status transitions, and audit trails for support requests.
 *
 * @security JWT Bearer Authentication
 * @remarks
 * Architecture:
 * - Multitenancy: Users can only interact with their own tickets (Data Isolation).
 * - RBAC: Admin routes are isolated under the `/admin` sub-path and guarded by RolesGuard.
 */
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  /**
   * List personal support tickets.
   * * Retrieves a paginated history of tickets submitted by the authenticated user.
   *
   * @param userId - Extracted from the validated JWT token.
   * @param page - Page index (Default: 1).
   * @param limit - Page size (Default: 10).
   * @returns Paginated result set with ticket summaries.
   * @status 200 OK
   */
  @Get()
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    return this.ticketService.findAllByUser(userId, pageNumber, limitNumber);
  }

  /**
   * Get ticket details.
   * * Fetches comprehensive info, including the linked conversation context.
   *
   * @param id - Ticket UUID.
   * @returns Full ticket details and resolution status.
   * @status 200 OK
   * @throws {NotFoundException} If the ticket is missing or unauthorized.
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ticketService.findByIdForUser(id, userId);
  }

  /**
   * Create/Escalate a ticket from AI chat.
   * * Transitions an AI chat message into a formal support ticket for human intervention.
   *
   * @param dto - Payload linking conversation, message, and issue description.
   * @returns The created ticket record with `OPEN` status.
   * @status 201 Created
   * @throws {ConflictException} If a ticket already exists for the given message ID.
   */
  @Post()
  async create(
    @Body() dto: CreateTicketDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ticketService.create(dto, userId);
  }

  // --- ADMIN ENDPOINTS ---

  /**
   * Global ticket overview (Admin only).
   * * Administrative view of all support requests across the entire system.
   *
   * @security ADMIN Role Required
   * @status 200 OK
   */
  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAllAdmin(
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    return this.ticketService.findAll(pageNumber, limitNumber);
  }

  /**
   * Administrative ticket inspection.
   * * Deep-dive into ticket details, user history, and AI conversation logs for investigation.
   *
   * @security ADMIN Role Required
   * @status 200 OK
   */
  @Get('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async findOneAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.ticketService.findByIdForAdmin(id);
  }

  /**
   * Transition ticket status (Admin only).
   * * Manually updates the state machine (e.g., OPEN -> IN_PROGRESS).
   *
   * @param dto - The new status to be applied.
   * @status 200 OK
   */
  @Patch('admin/:id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.ticketService.updateStatus(id, dto);
  }

  /**
   * Finalize ticket with admin resolution (Admin only).
   * * Submits the final response and automatically marks the ticket as RESOLVED.
   *
   * @param dto - The final resolution message or explanation.
   * @status 200 OK
   * @remarks This action triggers an auto-transition to the RESOLVED state.
   */
  @Patch('admin/:id/respond')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondTicketDto,
  ) {
    return this.ticketService.respond(id, dto);
  }
}