import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus } from '@prisma/client';

/**
 * Dashboard Repository
 *
 * Data Access Layer (DAL) for dashboard analytics and metrics aggregation.
 * Specializes in high-volume query optimization for statistical reports and real-time KPI dashboards.
 *
 * @remarks
 * Design Principles:
 * - Aggregation: Uses Prisma aggregate and concurrent queries for fast computations.
 * - Pagination: Implements cursor-free offset-based pagination for metadata consistency.
 * - Filtering: Supports optional status/feedback filters for scoped dashboard views.
 * - Efficiency: Parallel queries via Promise.all() to minimize database round trips.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate user feedback statistics for chatbot responses.
   *
   * Counts assistant messages by feedback status (HELPFUL/NOT_HELPFUL) and computes total feedback volume.
   * Used for satisfaction metrics in dashboard and quality monitoring reports.
   *
   * @returns Object with counts: helpful, notHelpful, and total feedback submissions.
   *
   * @remarks
   * - Filters: Only counts ASSISTANT role messages with non-null feedback.
   * - Performance: Uses concurrent Promise.all() for three aggregate queries.
   * - Zero-State: Returns {helpful: 0, notHelpful: 0, total: 0} if no feedback exists.
   */
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

  /**
   * Calculate statistical measures of AI response confidence scores.
   *
   * Computes average, minimum, and maximum confidence scores across all assistant messages.
   * Enables quality monitoring and identifies response reliability patterns.
   *
   * @returns Object with avg, min, and max confidence scores (range: 0-1). Defaults to 0 if no data.
   *
   * @remarks
   * - Range: Confidence scores are normalized to [0, 1].
   * - Filters: Only considers ASSISTANT messages with non-null confidence scores.
   * - Zero-State: Returns {avg: 0, min: 0, max: 0} if no scored messages exist.
   * - Precision: Raw float values; formatting handled at service/controller layer.
   */
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

  /**
   * Categorize assistant messages by confidence score ranges.
   *
   * Counts messages in three confidence brackets: low (0-0.4), medium (0.4-0.7), and high (0.7-1.0).
   * Provides insight into response quality distribution and model uncertainty levels.
   *
   * @returns Object with counts for low, medium, and high confidence message buckets.
   *
   * @remarks
   * - Brackets: Low [0.0, 0.4), Medium [0.4, 0.7), High [0.7, 1.0].
   * - Filters: Only counts ASSISTANT messages with numeric confidence scores.
   * - Performance: Parallel execution via Promise.all() for three range queries.
   * - Use Case: Dashboard visualization of response reliability distribution.
   */
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

  /**
   * Retrieve paginated list of conversations with optional feedback filtering.
   *
   * Fetches conversations with user metadata, message counts, and most recent feedback status.
   * Supports filtering by feedback type for targeted analysis and user satisfaction tracking.
   *
   * @param page - Current page number (1-indexed).
   * @param limit - Records per page (e.g., 10, 25, 50).
   * @param status - Optional filter: 'HELPFUL' or 'NOT_HELPFUL'. Trimmed and validated before use.
   * @returns Object with paginated conversations array and total record count.
   *
   * @remarks
   * - Pagination: Offset-based using (page-1)*limit.
   * - Filter Logic: Filters conversations that contain messages with matching feedback status.
   * - Filter Validation: Status is trimmed and checked for empty string before applying filter.
   * - Enrichment: Includes user info, message count, and last feedback received.
   * - Ordering: Sorted by createdAt descending (newest first).
   */
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

  /**
   * Aggregate ticket statistics by status.
   *
   * Counts total tickets and breaks down by status: OPEN, ON_PROGRESS, and RESOLVED.
   * Provides overview metrics for ticket management dashboards and SLA monitoring.
   *
   * @returns Object with total, open, onProgress, and resolved ticket counts.
   *
   * @remarks
   * - Status Enum: TicketStatus.OPEN, TicketStatus.ON_PROGRESS, TicketStatus.RESOLVED.
   * - Performance: Uses concurrent Promise.all() for four parallel count queries.
   * - Zero-State: Returns {total: 0, open: 0, onProgress: 0, resolved: 0} if no tickets exist.
   * - Use Case: Real-time ticket queue overview and workload distribution.
   */
  async getTicketStats() {
    const [total, open, onProgress, resolved] = await Promise.all([
      this.prisma.ticket.count(),
      this.prisma.ticket.count({ where: { status: TicketStatus.OPEN } }),
      this.prisma.ticket.count({ where: { status: TicketStatus.ON_PROGRESS } }),
      this.prisma.ticket.count({ where: { status: TicketStatus.RESOLVED } }),
    ]);
    return { total, open, onProgress, resolved };
  }

  /**
   * Calculate average response time for resolved tickets.
   *
   * Computes the mean time-to-resolution (createdAt → updatedAt) across all RESOLVED tickets.
   * Used for SLA compliance tracking and service performance analytics.
   *
   * @returns Average response time in milliseconds. Returns 0 if no resolved tickets exist.
   *
   * @remarks
   * - Scope: Only considers TicketStatus.RESOLVED tickets.
   * - Duration: Measures createdAt to updatedAt timestamp delta.
   * - Precision: Returned in milliseconds (ms), converted to HH:MM:SS at service layer.
   * - Zero-State: Returns 0 if zero resolved tickets for safe downstream processing.
   * - Performance: Full dataset fetch; consider caching for large ticket volumes.
   */
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

  /**
   * Retrieve paginated list of tickets with optional status filtering.
   *
   * Fetches tickets with user metadata, conversation association, and timestamp details.
   * Supports filtering by ticket status for workflow-specific views (e.g., open tickets only).
   *
   * @param page - Current page number (1-indexed).
   * @param limit - Records per page (e.g., 10, 25, 50).
   * @param status - Optional filter: TicketStatus.OPEN, ON_PROGRESS, or RESOLVED. If omitted, includes all.
   * @returns Object with paginated tickets array and total record count.
   *
   * @remarks
   * - Pagination: Offset-based using (page-1)*limit.
   * - Ordering: Sorted by createdAt descending (newest first).
   * - Enrichment: Includes user details and associated conversation ID for context.
   * - Use Case: Ticket queues, status-based views, and management dashboards.
   */
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

  /**
   * Aggregate comprehensive dashboard data for report generation and exports.
   *
   * Fetches all metrics required for period-based reporting: conversation/message/ticket volumes,
   * ticket status breakdown, user feedback distribution, AI confidence analysis, and detailed
   * lists for Excel/PDF export. Executes all sub-queries concurrently for optimal performance.
   *
   * @param startDate - Report period start date (inclusive).
   * @param endDate - Report period end date (inclusive).
   * @returns Aggregated report object with counts, statistics, distributions, and detailed data lists.
   *
   * @remarks
   * Query Breakdown (11 concurrent queries):
   * - Counts: totalConversations, totalMessages, totalTickets per period.
   * - Stats: ticketStats (by status), feedbackStats, confidenceStats, confidenceDistribution.
   * - Performance: avgResponseTimeMs for resolved tickets in period.
   * - Problematic: problematicConversations (with NOT_HELPFUL feedback).
   * - Exports: allConversationsForExcel, allTicketsForExcel (full lists for report generation).
   *
   * Response Fields:
   * - period: { startDate, endDate } for audit trail.
   * - Counts: totalConversations, totalMessages, totalTickets.
   * - Stats: ticketStats, feedbackStats, confidenceStats, confidenceDistribution.
   * - Performance: avgResponseTimeMs (milliseconds, converted to HH:MM:SS at service layer).
   * - Lists: problematicConversations, allConversationsForExcel, allTicketsForExcel.
   *
   * Date Range: Filters by createdAt field, inclusive on both bounds.
   * Concurrency: All 11 sub-queries run in parallel for fast report generation.
   * Use Case: Report generation, executive dashboards, analytics exports (PDF/Excel).
   */
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
      problematicConversations,
      allConversationsForExcel,
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
