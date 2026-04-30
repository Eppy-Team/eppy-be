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

@Injectable()
export class TicketService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly prisma: PrismaService,
  ) {}

  // ─── User ─────────────────────────────────────────────────────────────────

  async findAllByUser(userId: string) {
    const tickets = await this.ticketRepository.findAllByUserId(userId);
    return {
      message: 'Tickets retrieved successfully',
      data: tickets,
    };
  }

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

    // Cegah duplikasi — 1 message hanya boleh punya 1 tiket
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

  // ─── Admin ────────────────────────────────────────────────────────────────

  async findAll() {
    const tickets = await this.ticketRepository.findAll();
    return {
      message: 'All tickets retrieved successfully',
      data: tickets,
    };
  }

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