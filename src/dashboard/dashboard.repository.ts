import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus } from '@prisma/client';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Dashboard Chatbot ────────────────────────────────────────────────────

  async getFeedbackStats() {
    const [helpful, notHelpful, total] = await Promise.all([
      this.prisma.message.count({
        where: { role: 'ASSISTANT', feedback: 'HELPFUL' },
      }),
      this.prisma.message.count({
        where: { role: 'ASSISTANT', feedback: 'NOT_HELPFUL' },
      }),
      this.prisma.message.count({
        where: { role: 'ASSISTANT', feedback: { not: null } },
      }),
    ]);
    return { helpful, notHelpful, total };
  }

  async getConfidenceStats() {
    const result = await this.prisma.message.aggregate({
      where: { role: 'ASSISTANT', confidenceScore: { not: null } },
      _avg: { confidenceScore: true },
      _min: { confidenceScore: true },
      _max: { confidenceScore: true },
    });
    return {
      avg: result._avg.confidenceScore ?? 0,
      min: result._min.confidenceScore ?? 0,
      max: result._max.confidenceScore ?? 0,
    };
  }

  async getConfidenceDistribution() {
    const [low, medium, high] = await Promise.all([
      this.prisma.message.count({
        where: { role: 'ASSISTANT', confidenceScore: { gte: 0, lt: 0.4 } },
      }),
      this.prisma.message.count({
        where: { role: 'ASSISTANT', confidenceScore: { gte: 0.4, lt: 0.7 } },
      }),
      this.prisma.message.count({
        where: { role: 'ASSISTANT', confidenceScore: { gte: 0.7, lte: 1.0 } },
      }),
    ]);
    return { low, medium, high };
  }

  async getAllConversations(page: number, limit: number, status?: string) {
    const skip = (page - 1) * limit;
    const feedbackFilter =
      status && status.trim() !== ''
        ? { some: { role: 'ASSISTANT' as const, feedback: status as any } }
        : undefined;

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        where: feedbackFilter ? { messages: feedbackFilter } : undefined,
        select: {
          id: true,
          title: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { messages: true } },
          messages: {
            where: { role: 'ASSISTANT', feedback: { not: null } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { feedback: true },
          },
        },
      }),
      this.prisma.conversation.count({
        where: feedbackFilter ? { messages: feedbackFilter } : undefined,
      }),
    ]);

    return { conversations, total };
  }

  // ─── Dashboard Tiket ──────────────────────────────────────────────────────

  async getTicketStats() {
    const [total, open, onProgress, resolved] = await Promise.all([
      this.prisma.ticket.count(),
      this.prisma.ticket.count({ where: { status: TicketStatus.OPEN } }),
      this.prisma.ticket.count({ where: { status: TicketStatus.ON_PROGRESS } }),
      this.prisma.ticket.count({ where: { status: TicketStatus.RESOLVED } }),
    ]);
    return { total, open, onProgress, resolved };
  }

  async getAverageResponseTime(): Promise<number> {
    const resolvedTickets = await this.prisma.ticket.findMany({
      where: { status: TicketStatus.RESOLVED },
      select: { createdAt: true, updatedAt: true },
    });
    if (resolvedTickets.length === 0) return 0;
    const totalMs = resolvedTickets.reduce(
      (sum, t) => sum + (t.updatedAt.getTime() - t.createdAt.getTime()),
      0,
    );
    return Math.round(totalMs / resolvedTickets.length);
  }

  async getAllTickets(page: number, limit: number, status?: TicketStatus) {
    const skip = (page - 1) * limit;
    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        where: status ? { status } : undefined,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
          conversation: { select: { id: true } },
        },
      }),
      this.prisma.ticket.count({ where: status ? { status } : undefined }),
    ]);
    return { tickets, total };
  }

  // ─── Report Data (diperkaya untuk PDF & Excel) ────────────────────────────

  async getReportData(startDate: Date, endDate: Date) {
    const [
      totalConversations,
      totalMessages,
      totalTickets,
      ticketStats,
      feedbackStats,
      confidenceStats,
      confidenceDistribution,
      avgResponseTimeMs,
      // Percakapan NOT_HELPFUL untuk tabel "Percakapan Bermasalah" di PDF
      problematicConversations,
      // Semua percakapan dalam periode untuk sheet Excel
      allConversationsForExcel,
      // Semua tiket dalam periode untuk sheet Excel
      allTicketsForExcel,
    ] = await Promise.all([
      this.prisma.conversation.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.message.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.ticket.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      this.getTicketStats(),
      this.getFeedbackStats(),
      this.getConfidenceStats(),
      this.getConfidenceDistribution(),
      this.getAverageResponseTime(),

      // Percakapan dengan feedback NOT_HELPFUL dalam periode
      this.prisma.conversation.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          messages: {
            some: { role: 'ASSISTANT', feedback: 'NOT_HELPFUL' },
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          _count: { select: { messages: true } },
        },
      }),

      // Semua percakapan dalam periode (untuk Excel sheet detail)
      this.prisma.conversation.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          _count: { select: { messages: true } },
          messages: {
            where: { role: 'ASSISTANT', feedback: { not: null } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { feedback: true },
          },
        },
      }),

      // Semua tiket dalam periode (untuk Excel sheet detail)
      this.prisma.ticket.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          conversation: { select: { id: true } },
        },
      }),
    ]);

    return {
      period: { startDate, endDate },
      totalConversations,
      totalMessages,
      totalTickets,
      ticketStats,
      feedbackStats,
      confidenceStats,
      confidenceDistribution,
      avgResponseTimeMs,
      problematicConversations,
      allConversationsForExcel,
      allTicketsForExcel,
    };
  }
}