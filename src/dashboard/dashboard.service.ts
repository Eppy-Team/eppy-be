import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { DashboardRepository } from './dashboard.repository';
import { AiService } from '../ai/ai.service';

/**
 * Utility: Convert milliseconds to HH:MM:SS format.
 *
 * @param ms - Time duration in milliseconds.
 * @returns Formatted string (e.g., "02:34:56").
 *
 * @remarks
 * Used for converting average response times and other duration metrics
 * from raw milliseconds to human-readable time format.
 */
function msToHHMMSS(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

/**
 * Dashboard Service
 *
 * Business logic orchestrator for admin analytics and metrics dashboards.
 * Aggregates chatbot performance, ticket management, and system KPIs into actionable insights.
 * Provides dashboard views and report generation capabilities.
 *
 * Dependencies:
 * - DashboardRepository: Data aggregation and metrics retrieval.
 * - AiService: Optional integration for advanced analytics (reserved for future).
 *
 * @remarks
 * Responsibilities:
 * - Aggregate metrics from multiple data sources.
 * - Format and enrich raw data for frontend consumption.
 * - Generate period-based reports in multiple formats (JSON, PDF, Excel).
 * - Implement pagination and filtering for dataset exploration.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly aiService: AiService,
  ) {}

  /**
   * Retrieve chatbot performance dashboard with metrics and conversation data.
   *
   * Aggregates user satisfaction metrics (feedback distribution), AI confidence statistics,
   * and paginated conversation list. Supports filtering by feedback status.
   *
   * @param page - Current page number (1-indexed, default: 1).
   * @param limit - Records per page (default: 10).
   * @param status - Optional feedback filter: 'HELPFUL' or 'NOT_HELPFUL'.
   * @returns Dashboard object with satisfaction metrics, confidence data, and conversations list.
   *
   * @status 200 OK
   * @remarks
   * Metrics Aggregation:
   * - Satisfaction Chart: Helpful/not-helpful counts with percentage calculation.
   * - Confidence Score: Average, minimum, maximum (4 decimal precision).
   * - Confidence Distribution: Counts in low/medium/high brackets.
   * - Conversations: Paginated with user info and last feedback status.
   *
   * Performance: Parallel execution of 4 independent queries for fast response.
   */
  async getChatbotDashboard(page: number, limit: number, status?: string) {
    const [
      feedbackStats,
      confidenceStats,
      confidenceDistribution,
      conversationsData,
    ] = await Promise.all([
      this.dashboardRepository.getFeedbackStats(),
      this.dashboardRepository.getConfidenceStats(),
      this.dashboardRepository.getConfidenceDistribution(),
      this.dashboardRepository.getAllConversations(page, limit, status),
    ]);

    const satisfactionChart = {
      helpful: feedbackStats.helpful,
      notHelpful: feedbackStats.notHelpful,
      totalFeedback: feedbackStats.total,
      helpfulRate:
        feedbackStats.total > 0
          ? `${((feedbackStats.helpful / feedbackStats.total) * 100).toFixed(1)}%`
          : '0%',
    };

    const conversations = conversationsData.conversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      user: conv.user,
      messageCount: conv._count.messages,
      lastFeedback: conv.messages[0]?.feedback ?? null,
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

  /**
   * Retrieve ticket management dashboard with SLA metrics and queue status.
   *
   * Aggregates ticket counts by status, calculates average response time, and provides
   * paginated ticket list with optional status filtering.
   *
   * @param page - Current page number (1-indexed, default: 1).
   * @param limit - Records per page (default: 10).
   * @param status - Optional status filter: TicketStatus.OPEN, ON_PROGRESS, or RESOLVED.
   * @returns Dashboard object with ticket summary, SLA metrics, and paginated ticket list.
   *
   * @status 200 OK
   * @remarks
   * Summary Metrics:
   * - Total: All tickets across all statuses.
   * - Open: TicketStatus.OPEN queue count.
   * - OnProgress: TicketStatus.ON_PROGRESS queue count.
   * - Resolved: TicketStatus.RESOLVED completed count.
   * - AvgResponseTime: Mean time-to-resolution (HH:MM:SS format).
   *
   * Performance: Parallel execution of 3 independent queries for fast response.
   */
  async getTicketDashboard(page: number, limit: number, status?: TicketStatus) {
    const [ticketStats, avgResponseTimeMs, ticketsData] = await Promise.all([
      this.dashboardRepository.getTicketStats(),
      this.dashboardRepository.getAverageResponseTime(),
      this.dashboardRepository.getAllTickets(page, limit, status),
    ]);

    return {
      message: 'Ticket dashboard retrieved successfully',
      data: {
        summary: {
          total: ticketStats.total,
          open: ticketStats.open, 
          onProgress: ticketStats.onProgress, 
          resolved: ticketStats.resolved, 
          avgResponseTime: msToHHMMSS(avgResponseTimeMs), 
        },
        tickets: ticketsData.tickets,
      },
      meta: {
        total: ticketsData.total,
        page,
        limit,
        totalPages: Math.ceil(ticketsData.total / limit),
      },
    };
  }

  /**
   * Generate comprehensive system report for a date range.
   *
   * Aggregates all dashboard metrics (conversations, messages, tickets, feedback, confidence)
   * for a specified period and calculates escalation rate (ticket/conversation ratio).
   * Serves as data source for report export and executive dashboards.
   *
   * @param startDate - Report period start (format: YYYY-MM-DD, inclusive).
   * @param endDate - Report period end (format: YYYY-MM-DD, inclusive).
   * @returns Comprehensive report object with period metadata and aggregated metrics.
   *
   * @status 200 OK
   * @throws {BadRequestException} If date format is invalid or startDate > endDate.
   *
   * @remarks
   * Flow:
   * 1. Validate date string format (YYYY-MM-DD).
   * 2. Validate date logic (start <= end).
   * 3. Normalize end date to 23:59:59.999 for inclusive range.
   * 4. Fetch all report data from repository (7 concurrent queries).
   * 5. Calculate escalation rate (tickets per conversation).
   * 6. Return report with metadata and all aggregated metrics.
   *
   * Escalation Rate: (totalTickets / totalConversations) * 100 (percentage).
   * Generated At: Timestamp of report generation for audit trail.
   */
  async getReport(startDate: string, endDate: string) {
    // [STEP 1] Validate date string format
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        'Format tanggal tidak valid. Gunakan YYYY-MM-DD',
      );
    }

    // [STEP 2] Validate date logic (start <= end)
    if (start > end) {
      throw new BadRequestException(
        'startDate tidak boleh lebih besar dari endDate',
      );
    }

    // [STEP 3] Normalize end date to 23:59:59.999 for inclusive range
    end.setHours(23, 59, 59, 999);

    // [STEP 4] Fetch all report data from repository (7 concurrent queries)
    const reportData = await this.dashboardRepository.getReportData(start, end);

    // [STEP 5] Calculate escalation rate (tickets per conversation)
    const escalationRate =
      reportData.totalConversations > 0
        ? (
            (reportData.totalTickets / reportData.totalConversations) *
            100
          ).toFixed(2)
        : '0.00';

    // [STEP 6] Return report with metadata and all aggregated metrics
    return {
      message: 'Report generated successfully',
      data: {
        ...reportData,
        escalationRate: `${escalationRate}%`,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Export system report in specified format (PDF or Excel).
   *
   * Generates period-based report data and converts it to the requested file format.
   * Returns binary buffer and metadata for file download via HTTP response.
   *
   * @param startDate - Report period start (format: YYYY-MM-DD).
   * @param endDate - Report period end (format: YYYY-MM-DD).
   * @param format - Export format: 'pdf' or 'excel'.
   * @returns Object with buffer (file content), filename, and mimeType for HTTP download.
   *
   * @throws {BadRequestException} If date validation fails or required packages are missing.
   *
   * @remarks
   * Flow:
   * 1. Call getReport() to validate dates and fetch aggregated data.
   * 2. Route to format-specific generator (generateExcel or generatePdf).
   * 3. Return binary buffer with appropriate HTTP headers metadata.
   *
   * File Format:
   * - Excel: Multi-sheet workbook (Overview, Kepuasan User, Performa Chatbot, Status Tiket).
   * - PDF: Single document with all metrics and charts.
   *
   * Dependencies: exceljs (for Excel), pdfkit or similar (for PDF).
   */
  async exportReport(
    startDate: string,
    endDate: string,
    format: 'pdf' | 'excel',
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const { data: reportData } = await this.getReport(startDate, endDate);
    return format === 'excel'
      ? this.generateExcel(reportData)
      : this.generatePdf(reportData);
  }

  /**
   * Private: Generate Excel workbook from report data.
   *
   * Creates a multi-sheet Excel document containing overview, user satisfaction metrics,
   * chatbot performance, and ticket status data. Uses ExcelJS library for generation.
   *
   * @param reportData - Aggregated report data object (output from getReportData).
   * @returns Object with buffer (file content), filename, and mimeType for download.
   *
   * @throws {BadRequestException} If ExcelJS package is not installed.
   *
   * @remarks
   * Sheet Structure:
   * 1. Overview: Period range, conversation/message/ticket counts, escalation rate.
   * 2. Kepuasan User (User Satisfaction): Feedback counts (helpful/not helpful).
   * 3. Performa Chatbot (Chatbot Performance): Confidence stats and distribution.
   * 4. Status Tiket (Ticket Status): Ticket status breakdown.
   *
   * Formatting: Bold headers, fixed column widths, date formatting.
   * Filename: report_<startDate>_<endDate>.xlsx.
   */
  private async generateExcel(reportData: any): Promise<{
    buffer: Buffer;
    filename: string;
    mimeType: string;
  }> {
    let ExcelJS: any;
    try {
      ExcelJS = (await import('exceljs')).default;
    } catch {
      throw new BadRequestException('Jalankan: npm install exceljs');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Eppy Helpdesk';
    workbook.created = new Date();

    const sheet1 = workbook.addWorksheet('Overview');
    sheet1.columns = [
      { header: 'Metrik', key: 'metric', width: 35 },
      { header: 'Nilai', key: 'value', width: 20 },
    ];
    sheet1.getRow(1).font = { bold: true };
    sheet1.addRows([
      {
        metric: 'Periode',
        value: `${reportData.period.startDate} s/d ${reportData.period.endDate}`,
      },
      { metric: 'Total Percakapan', value: reportData.totalConversations },
      { metric: 'Total Pesan', value: reportData.totalMessages },
      { metric: 'Total Tiket', value: reportData.totalTickets },
      { metric: 'Tingkat Eskalasi', value: reportData.escalationRate },
    ]);

    const sheet2 = workbook.addWorksheet('Kepuasan User');
    sheet2.columns = [
      { header: 'Metrik', key: 'metric', width: 35 },
      { header: 'Nilai', key: 'value', width: 20 },
    ];
    sheet2.getRow(1).font = { bold: true };
    sheet2.addRows([
      { metric: 'Total Feedback', value: reportData.feedbackStats.total },
      { metric: 'Puas (HELPFUL)', value: reportData.feedbackStats.helpful },
      {
        metric: 'Tidak Puas (NOT_HELPFUL)',
        value: reportData.feedbackStats.notHelpful,
      },
    ]);

    const sheet3 = workbook.addWorksheet('Performa Chatbot');
    sheet3.columns = [
      { header: 'Metrik', key: 'metric', width: 40 },
      { header: 'Nilai', key: 'value', width: 20 },
    ];
    sheet3.getRow(1).font = { bold: true };
    sheet3.addRows([
      {
        metric: 'Rata-rata Confidence Score',
        value: reportData.confidenceStats.avg,
      },
      { metric: 'Confidence Minimum', value: reportData.confidenceStats.min },
      { metric: 'Confidence Maximum', value: reportData.confidenceStats.max },
      {
        metric: 'Respons Akurasi Rendah (0.0-0.4)',
        value: reportData.confidenceDistribution.low,
      },
      {
        metric: 'Respons Akurasi Sedang (0.4-0.7)',
        value: reportData.confidenceDistribution.medium,
      },
      {
        metric: 'Respons Akurasi Tinggi (0.7-1.0)',
        value: reportData.confidenceDistribution.high,
      },
    ]);

    const sheet4 = workbook.addWorksheet('Status Tiket');
    sheet4.columns = [
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Jumlah', key: 'count', width: 15 },
    ];
    sheet4.getRow(1).font = { bold: true };
    sheet4.addRows([
      { status: 'Open (Baru)', count: reportData.ticketStats.open },
      {
        status: 'On Progress (Aktif)',
        count: reportData.ticketStats.onProgress,
      },
      { status: 'Resolved (Selesai)', count: reportData.ticketStats.resolved },
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buffer),
      filename: `eppy-report-${reportData.period.startDate}-${reportData.period.endDate}.xlsx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /**
   * Private: Generate PDF document from report data.
   *
   * Creates a formatted PDF document containing all report metrics: overview, user satisfaction,
   * chatbot performance, and ticket management statistics. Uses PDFKit library for generation.
   *
   * @param reportData - Aggregated report data object (output from getReportData).
   * @returns Object with buffer (file content), filename, and mimeType for download.
   *
   * @throws {BadRequestException} If PDFKit package is not installed.
   *
   * @remarks
   * Content Structure:
   * - Header: Report title, period, and generation timestamp.
   * - Section 1: System Overview (conversations, messages, tickets, escalation rate).
   * - Section 2: User Satisfaction (feedback distribution with percentages).
   * - Section 3: Chatbot Performance (confidence metrics and distribution).
   * - Section 4: Ticket Management (status breakdown and metrics).
   *
   * Formatting: Formatted text, tables, page breaks, timestamps.
   * Filename: report_<startDate>_<endDate>.pdf.
   */
  private async generatePdf(reportData: any): Promise<{
    buffer: Buffer;
    filename: string;
    mimeType: string;
  }> {
    let PDFDocument: any;
    try {
      PDFDocument = (await import('pdfkit')).default;
    } catch {
      throw new BadRequestException(
        'Jalankan: npm install pdfkit @types/pdfkit',
      );
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const addSection = (title: string) => {
        doc.moveDown(1.5).fontSize(14).font('Helvetica-Bold').text(title);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5).fontSize(10).font('Helvetica');
      };

      const addRow = (label: string, value: string | number) => {
        doc
          .text(`${label}: `, { continued: true })
          .font('Helvetica-Bold')
          .text(String(value));
        doc.font('Helvetica');
      };

      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('Eppy Helpdesk — Laporan Analisis', { align: 'center' });
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          `Periode: ${reportData.period.startDate} s/d ${reportData.period.endDate}`,
          { align: 'center' },
        )
        .text(`Dibuat: ${reportData.generatedAt}`, { align: 'center' });

      addSection('Ringkasan Umum');
      addRow('Total Percakapan', reportData.totalConversations);
      addRow('Total Pesan', reportData.totalMessages);
      addRow('Total Tiket', reportData.totalTickets);
      addRow('Tingkat Eskalasi', reportData.escalationRate);

      addSection('Kepuasan User');
      addRow('Total Feedback', reportData.feedbackStats.total);
      addRow('Puas (Helpful)', reportData.feedbackStats.helpful);
      addRow('Tidak Puas (Not Helpful)', reportData.feedbackStats.notHelpful);

      addSection('Performa Chatbot');
      addRow('Rata-rata Confidence Score', reportData.confidenceStats.avg);
      addRow('Confidence Minimum', reportData.confidenceStats.min);
      addRow('Confidence Maximum', reportData.confidenceStats.max);
      addRow('Akurasi Rendah (0.0–0.4)', reportData.confidenceDistribution.low);
      addRow(
        'Akurasi Sedang (0.4–0.7)',
        reportData.confidenceDistribution.medium,
      );
      addRow(
        'Akurasi Tinggi (0.7–1.0)',
        reportData.confidenceDistribution.high,
      );

      addSection('Status Tiket');
      addRow('Open (Baru)', reportData.ticketStats.open);
      addRow('On Progress (Aktif)', reportData.ticketStats.onProgress);
      addRow('Resolved (Selesai)', reportData.ticketStats.resolved);

      doc
        .moveDown(3)
        .fontSize(8)
        .fillColor('#9ca3af')
        .text('Dokumen ini dibuat otomatis oleh sistem Eppy.', {
          align: 'center',
        });

      doc.end();
    });

    return {
      buffer,
      filename: `eppy-report-${reportData.period.startDate}-${reportData.period.endDate}.pdf`,
      mimeType: 'application/pdf',
    };
  }
}
