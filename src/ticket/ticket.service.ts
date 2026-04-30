import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TicketRepository } from './ticket.repository';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { RespondTicketDto } from './dto/respond-ticket.dto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Ticket Service
 * * Core business logic layer for managing support ticket lifecycles.
 * This service orchestrates the transition of AI-related issues into human-mediated support,
 * ensuring strict ownership validation and state management.
 *
 * @remarks
 * Operational Integrity:
 * - Ownership Enforcement: Every user action is validated against their unique ID to prevent cross-tenant data leakage.
 * - Idempotency: Enforces a 1:1 relationship between a specific Chat Message and a Support Ticket.
 * - Workflow Automation: Automatically transitions ticket status to `RESOLVED` upon admin response.
 */
@Injectable()
export class TicketService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Retrieve paginated history of tickets for the current user.
   * * Acts as the data provider for the user's "My Support Requests" dashboard.
   *
   * @param userId - Extracted user ID from JWT to ensure data isolation.
   * @param page - Current offset index.
   * @param limit - Maximum records per response.
   * @returns Paginated result set with dynamic metadata for frontend rendering.
   */
  async findAllByUser(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const { tickets, total } = await this.ticketRepository.findAllByUserId(userId, {
      skip,
      take: limit,
    });

    return {
      message: 'Tickets retrieved successfully',
      data: tickets,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }

  /**
   * Fetch full ticket details for user-side viewing.
   * * Provides a deep view of a specific ticket, including its link to the original chat.
   *
   * @param id - Ticket UUID.
   * @param userId - Authenticated user ID for authorization check.
   * @throws {NotFoundException} If the ticket is missing or belongs to another user.
   */
  async findByIdForUser(id: string, userId: string) {
    const ticket = await this.ticketRepository.findByIdAndUserId(id, userId);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return {
      message: 'Ticket retrieved successfully',
      data: ticket,
    };
  }

  /**
   * Escalate a chat message to a formal support ticket.
   * * Performs high-level validation of conversation context before persisting the ticket.
   *
   * @param dto - Object containing message ID, conversation ID, and issue details.
   * @param userId - ID of the user initiating the escalation.
   * @throws {NotFoundException} If the referenced conversation or message does not exist.
   * @throws {BadRequestException} If the user attempts to escalate the same message twice.
   */
  async create(dto: CreateTicketDto, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: dto.conversationId, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const message = await this.prisma.message.findFirst({
      where: { id: dto.messageId, conversationId: dto.conversationId },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Prevention of duplicate escalations to maintain audit trail clarity
    const existingTicket = await this.prisma.ticket.findFirst({
      where: { messageId: dto.messageId },
    });
    if (existingTicket) {
      throw new BadRequestException(
        'Tiket untuk pesan ini sudah pernah dibuat',
      );
    }

    const ticket = await this.ticketRepository.create({
      userId,
      conversationId: dto.conversationId,
      messageId: dto.messageId,
      title: dto.title,
      description: dto.description,
    });

    return {
      message: 'Ticket created successfully',
      data: ticket,
    };
  }

  /**
   * Global ticket retrieval for Administrative Oversight.
   * * Provides a unified view of all user escalations across the platform.
   *
   * @param page - Page number.
   * @param limit - Page limit.
   * @security Restricted to Admin users via Controller guards.
   */
  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const { tickets, total } = await this.ticketRepository.findAll({
      skip,
      take: limit,
    });

    return {
      message: 'All tickets retrieved successfully',
      data: tickets,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }

  /**
   * Detailed ticket investigation for Admins.
   * * Supplies the full relationship graph (User -> Conversation -> Message) for deep investigation.
   *
   * @param id - Ticket UUID.
   */
  async findByIdForAdmin(id: string) {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return {
      message: 'Ticket retrieved successfully',
      data: ticket,
    };
  }

  /**
   * Manually transition a ticket's workflow status.
   * * Enables admins to move tickets from 'OPEN' to 'IN_PROGRESS'.
   *
   * @param id - Ticket UUID.
   * @param dto - Payload containing the new enum status.
   */
  async updateStatus(id: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const updated = await this.ticketRepository.updateStatus(id, dto.status);
    return {
      message: 'Ticket status updated successfully',
      data: updated,
    };
  }

  /**
   * Submit a resolution response and close the ticket.
   * * Completes the support lifecycle by providing feedback and setting status to `RESOLVED`.
   *
   * @param id - Ticket UUID.
   * @param dto - Payload containing the administrator's feedback.
   * @remarks This action triggers an automatic state change to terminal 'RESOLVED' status.
   */
  async respond(id: string, dto: RespondTicketDto) {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const updated = await this.ticketRepository.updateAdminResponse(
      id,
      dto.adminResponse,
    );
    return {
      message: 'Ticket response submitted successfully',
      data: updated,
    };
  }
}