import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus } from '@prisma/client';

@Injectable()
export class TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── User ─────────────────────────────────────────────────────────────────

  async findAllByUserId(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

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

  // ─── Admin ────────────────────────────────────────────────────────────────

  async findAll() {
    return this.prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
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
    });
  }

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