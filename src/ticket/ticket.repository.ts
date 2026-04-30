import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus } from '@prisma/client';

/**
 * Ticket Repository
 * * Data Access Layer (DAL) for high-integrity ticket lifecycle management.
 * This repository encapsulates complex Prisma queries, ensuring that every 
 * database interaction is optimized for both read-heavy user dashboards 
 * and write-heavy admin workflows.
 *
 * @remarks
 * Query Philosophy:
 * - Selective Loading: Explicitly defines `select` blocks to only fetch fields required 
 *   by the business logic, reducing memory overhead and database I/O.
 * - Concurrency: Leverages `Promise.all` for paginated metadata to reduce API latency.
 * - State Integrity: Enforces strict enum-based status transitions at the database level.
 */
@Injectable()
export class TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch paginated tickets for a specific user workspace.
   * * Executes a non-blocking concurrent query to fetch both the dataset and total count.
   *
   * @param userId - The unique identifier of the ticket owner.
   * @param params - Offset-based pagination constraints ({ skip, take }).
   * @returns A payload containing the ticket slice and total record count.
   *
   * @remarks
   * Performance: Sorted by `createdAt: desc` to prioritize the most recent issues.
   */
  async findAllByUserId(userId: string, params: { skip?: number; take?: number }) {
    const { skip, take } = params;

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.ticket.count({ where: { userId } }),
    ]);

    return { tickets, total };
  }

  /**
   * Retrieve a ticket with its contextual chat lineage.
   * * Fetches the ticket details along with specific conversation and message 
   * metadata that triggered the escalation.
   *
   * @param id - Ticket UUID.
   * @param userId - User ID for ownership verification (prevents IDOR vulnerabilities).
   * @returns Comprehensive ticket data or null if the record is inaccessible.
   */
  async findByIdAndUserId(id: string, userId: string) {
    return this.prisma.ticket.findFirst({
      where: { id, userId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        adminResponse: true,
        createdAt: true,
        updatedAt: true,
        conversation: {
          select: { id: true, title: true },
        },
        message: {
          select: { id: true, content: true, role: true },
        },
      },
    });
  }

  /**
   * Persist a new escalation event.
   * * Creates a formal ticket record linked to the specific chat interaction history.
   *
   * @param data - The escalation payload including context IDs and issue description.
   * @returns The created record with initial status metadata.
   */
  async create(data: {
    userId: string;
    conversationId: string;
    messageId: string;
    title: string;
    description: string;
  }) {
    return this.prisma.ticket.create({
      data: {
        userId: data.userId,
        conversationId: data.conversationId,
        messageId: data.messageId,
        title: data.title,
        description: data.description,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });
  }

  /**
   * Global ticket retrieval for Administrative View.
   * * Aggregates tickets across all users, including owner identity for audit trails.
   *
   * @param params - Pagination constraints for global ticket listing.
   * @returns All-user ticket slice and total count for admin dashboard.
   */
  async findAll(params: { skip?: number; take?: number }) {
    const { skip, take } = params;

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.ticket.count(),
    ]);

    return { tickets, total };
  }

  /**
   * Retrieve comprehensive details of a ticket by UUID.
   * * Fetches full relationship graph (User, Conversation, Message) for admin inspection.
   *
   * @param id - Target ticket UUID.
   */
  async findById(id: string) {
    return this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        adminResponse: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: { id: true, name: true, email: true },
        },
        conversation: {
          select: { id: true, title: true },
        },
        message: {
          select: { id: true, content: true, role: true },
        },
      },
    });
  }

  /**
   * Atomic ticket status transition.
   * * Updates the workflow state as tickets move through the resolution pipeline.
   *
   * @param id - Ticket UUID.
   * @param status - The new target status from the `TicketStatus` enum.
   */
  async updateStatus(id: string, status: TicketStatus) {
    return this.prisma.ticket.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Record an admin response and automatically resolve the ticket.
   * * An atomic operation that persists the resolution feedback and marks the ticket as complete.
   *
   * @param id - Ticket UUID.
   * @param adminResponse - The final resolution message.
   * @remarks
   * Side Effect: This operation hardcodes the status to `RESOLVED` in the database transaction.
   */
  async updateAdminResponse(id: string, adminResponse: string) {
    return this.prisma.ticket.update({
      where: { id },
      data: {
        adminResponse,
        status: TicketStatus.RESOLVED, 
      },
      select: {
        id: true,
        title: true,
        status: true,
        adminResponse: true,
        updatedAt: true,
      },
    });
  }
}