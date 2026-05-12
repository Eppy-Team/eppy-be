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

  // List semua percakapan untuk tabel dashboard chatbot
  async getAllConversations(
    page: number,
    limit: number,
    status?: string, // 'HELPFUL' | 'NOT_HELPFUL' | undefined
  ) {
    const skip = (page - 1) * limit;

    // Filter berdasarkan feedback jika ada
    const feedbackFilter = status
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
          // Ambil feedback terakhir dari pesan assistant
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
}