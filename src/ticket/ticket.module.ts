import { Module } from '@nestjs/common';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { TicketRepository } from './ticket.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Ticket Module
 * * The official escalation and support management layer of the application.
 * This module facilitates the transition from AI-assisted chat to human-mediated 
 * support, managing the end-to-end lifecycle of support requests.
 *
 * @remarks
 * Operational Model:
 * - Escalation Path: Directly linked to `ChatModule` context to allow pinpointing 
 *   specific AI inaccuracies or technical issues.
 * - Workflow States: Manages an asynchronous state machine (OPEN, IN_PROGRESS, RESOLVED).
 * - Governance: Enforces strict Role-Based Access Control (RBAC) to separate 
 *   end-user workspaces from administrative dashboards.
 *
 * Separation of Concerns:
 * - ChatModule: Real-time, synchronous AI interaction.
 * - TicketModule: Long-running, asynchronous issue resolution and audit trails.
 */
@Module({
  controllers: [TicketController],
  providers: [
    TicketService, 
    TicketRepository, 
    PrismaService
  ],
})
export class TicketModule {}