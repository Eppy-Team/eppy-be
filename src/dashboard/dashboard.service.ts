import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { DashboardRepository } from './dashboard.repository';
import { AiService } from '../ai/ai.service';

// Helper: convert ms ke format HH:MM:SS
function msToHHMMSS(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly aiService: AiService,
  ) {}

  // ─── GET /dashboard/chatbot ───────────────────────────────────────────────
  // Data untuk Dashboard Chatbot (pie chart + tabel percakapan)

  async getChatbotDashboard(page: number, limit: number, status?: string) {
    const [feedbackStats, confidenceStats, confidenceDistribution, conversationsData] =
      await Promise.all([
        this.dashboardRepository.getFeedbackStats(),
        this.dashboardRepository.getConfidenceStats(),
        this.dashboardRepository.getConfidenceDistribution(),
        this.dashboardRepository.getAllConversations(page, limit, status),
      ]);

    // Format pie chart kepuasan
    const satisfactionChart = {
      helpful: feedbackStats.helpful,
      notHelpful: feedbackStats.notHelpful,
      totalFeedback: feedbackStats.total,
      helpfulRate:
        feedbackStats.total > 0
          ? `${((feedbackStats.helpful / feedbackStats.total) * 100).toFixed(1)}%`
          : '0%',
    };

    // Format tabel percakapan — sertakan status feedback terakhir
    const conversations = conversationsData.conversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      user: conv.user,
      messageCount: conv._count.messages,
      lastFeedback: conv.messages[0]?.feedback ?? null, // HELPFUL | NOT_HELPFUL | null
    }));

    return {
      message: 'Chatbot dashboard retrieved successfully',
      data: {
        satisfactionChart,
        confidenceScore: {
          avg: parseFloat(confidenceStats.avg.toFixed(4)),
          min: parseFloat(confidenceStats.min.toFixed(4)),
          max: parseFloat(confidenceStats.max.toFixed(4)),
        },
        confidenceDistribution,
        conversations,
      },
      meta: {
        total: conversationsData.total,
        page,
        limit,
        totalPages: Math.ceil(conversationsData.total / limit),
      },
    };
  }
}