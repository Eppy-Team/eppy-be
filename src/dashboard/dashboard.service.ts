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

function formatDateID(date: Date | string): string {
  const d = new Date(date);
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

function formatReportFilename(
  startDate: Date,
  endDate: Date,
  ext: string,
): string {
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const startMonth = months[startDate.getMonth()];
  const endMonth = months[endDate.getMonth()];
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  const periodLabel =
    startMonth === endMonth && startYear === endYear
      ? `${startMonth}_${startYear}`
      : `${startMonth}_${startYear}-${endMonth}_${endYear}`;

  return `Eppy_Report_${periodLabel}.${ext}`;
}

function feedbackLabel(feedback: string | null): string {
  if (feedback === 'HELPFUL') return 'Puas';
  if (feedback === 'NOT_HELPFUL') return 'Tidak Puas';
  return '-';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'Baru',
    ON_PROGRESS: 'Aktif',
    RESOLVED: 'Selesai',
  };
  return map[status] ?? status;
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

    // Bot accuracy warning
    const avgScore = confidenceStats.avg;
    const botAccuracy = {
      score: parseFloat(avgScore.toFixed(4)),
      status: avgScore < 0.5 ? 'LOW' : avgScore < 0.7 ? 'MEDIUM' : 'HIGH',
      warning:
        avgScore < 0.5
          ? 'Bot butuh pelatihan data lebih lanjut'
          : avgScore < 0.7
            ? 'Performa bot cukup, masih bisa dioptimasi'
            : 'Performa bot baik',
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
        botAccuracy,
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
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        'Format tanggal tidak valid. Gunakan YYYY-MM-DD',
      );
    }
    if (start > end) {
      throw new BadRequestException(
        'startDate tidak boleh lebih besar dari endDate',
      );
    }
    end.setHours(23, 59, 59, 999);

    const reportData = await this.dashboardRepository.getReportData(start, end);
    const escalationRate =
      reportData.totalConversations > 0
        ? (
            (reportData.totalTickets / reportData.totalConversations) *
            100
          ).toFixed(2)
        : '0.00';

    return {
      message: 'Report generated successfully',
      data: {
        ...reportData,
        escalationRate: `${escalationRate}%`,
        avgResponseTime: msToHHMMSS(reportData.avgResponseTimeMs),
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

    const BLUE = 'FF1D4ED8';
    const WHITE = 'FFFFFFFF';
    const GREEN = 'FF16A34A';
    const YELLOW = 'FFD97706';
    const RED = 'FFDC2626';
    const LIGHT_BLUE = 'FFE0EFFE';
    const LIGHT_RED = 'FFFEF2F2';
    const LIGHT_GREEN = 'FFF0FDF4';
    const LIGHT_YELLOW = 'FFFEFCE8';

    const headerStyle = (bgColor: string = BLUE) => ({
      font: { bold: true, color: { argb: WHITE }, size: 11 },
      fill: {
        type: 'pattern' as const,
        pattern: 'solid' as const,
        fgColor: { argb: bgColor },
      },
      alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
      border: {
        bottom: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
      },
    });

    // ── Sheet 1: Ringkasan ──
    const sheet1 = workbook.addWorksheet('Ringkasan');
    sheet1.columns = [
      { key: 'metric', width: 40 },
      { key: 'value', width: 25 },
    ];
    sheet1.getRow(1).values = ['Metrik', 'Nilai'];
    sheet1
      .getRow(1)
      .eachCell((cell: any) => Object.assign(cell, headerStyle()));

    const summaryRows = [
      [
        'Periode',
        `${formatDateID(reportData.period.startDate)} — ${formatDateID(reportData.period.endDate)}`,
      ],
      ['Dibuat Pada', formatDateID(reportData.generatedAt)],
      ['', ''],
      ['Total Percakapan', reportData.totalConversations],
      ['Total Pesan', reportData.totalMessages],
      ['Total Tiket', reportData.totalTickets],
      ['Tingkat Eskalasi', reportData.escalationRate],
      ['Rata-rata Waktu Respon Admin', reportData.avgResponseTime ?? '-'],
      ['', ''],
      ['Feedback Puas (Helpful)', reportData.feedbackStats.helpful],
      [
        'Feedback Tidak Puas (Not Helpful)',
        reportData.feedbackStats.notHelpful,
      ],
      ['Total Feedback', reportData.feedbackStats.total],
      ['', ''],
      ['Avg Confidence Score', reportData.confidenceStats.avg.toFixed(4)],
      ['Min Confidence Score', reportData.confidenceStats.min.toFixed(4)],
      ['Max Confidence Score', reportData.confidenceStats.max.toFixed(4)],
      [
        'Respons Akurasi Rendah (0.0-0.4)',
        reportData.confidenceDistribution.low,
      ],
      [
        'Respons Akurasi Sedang (0.4-0.7)',
        reportData.confidenceDistribution.medium,
      ],
      [
        'Respons Akurasi Tinggi (0.7-1.0)',
        reportData.confidenceDistribution.high,
      ],
      ['', ''],
      ['Tiket Baru (Open)', reportData.ticketStats.open],
      ['Tiket Aktif (On Progress)', reportData.ticketStats.onProgress],
      ['Tiket Selesai (Resolved)', reportData.ticketStats.resolved],
    ];

    summaryRows.forEach(([metric, value], i) => {
      const row = sheet1.addRow({ metric, value });
      if (i % 2 === 0 && metric !== '') {
        row.getCell('metric').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        };
      }
    });

    // ── Sheet 2: Daftar Percakapan ──
    const sheet2 = workbook.addWorksheet('Daftar Percakapan');
    sheet2.columns = [
      { header: 'ID Percakapan', key: 'id', width: 38 },
      { header: 'Nama User', key: 'name', width: 22 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Jumlah Pesan', key: 'msgCount', width: 16 },
      { header: 'Feedback Terakhir', key: 'feedback', width: 20 },
      { header: 'Waktu', key: 'time', width: 28 },
      { header: 'Quick Link', key: 'link', width: 55 },
    ];
    sheet2
      .getRow(1)
      .eachCell((cell: any) => Object.assign(cell, headerStyle()));

    (reportData.allConversationsForExcel ?? []).forEach(
      (conv: any, idx: number) => {
        const fb = conv.messages?.[0]?.feedback ?? null;
        const row = sheet2.addRow({
          id: conv.id,
          name: conv.user?.name ?? '-',
          email: conv.user?.email ?? '-',
          msgCount: conv._count?.messages ?? 0,
          feedback: feedbackLabel(fb),
          time: formatDateID(conv.createdAt),
          link: `https://eppy.id/admin/conversations/${conv.id}`,
        });

        // Warna baris berdasarkan feedback
        if (fb === 'NOT_HELPFUL') {
          row.eachCell((cell: any) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: LIGHT_RED },
            };
          });
          row.getCell('feedback').font = { color: { argb: RED }, bold: true };
        } else if (fb === 'HELPFUL') {
          row.getCell('feedback').font = { color: { argb: GREEN }, bold: true };
        } else if (idx % 2 === 0) {
          row.eachCell((cell: any) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF9FAFB' },
            };
          });
        }

        // Quick link sebagai hyperlink
        const linkCell = row.getCell('link');
        linkCell.value = {
          text: `Buka percakapan`,
          hyperlink: `https://eppy.id/admin/conversations/${conv.id}`,
        };
        linkCell.font = { color: { argb: BLUE }, underline: true };
      },
    );

    // ── Sheet 3: Daftar Tiket ──
    const sheet3 = workbook.addWorksheet('Daftar Tiket');
    sheet3.columns = [
      { header: 'ID Tiket', key: 'id', width: 38 },
      { header: 'Judul', key: 'title', width: 35 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Nama User', key: 'name', width: 22 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Waktu Dibuat', key: 'time', width: 28 },
      { header: 'ID Percakapan', key: 'convId', width: 38 },
      { header: 'Quick Link', key: 'link', width: 55 },
    ];
    sheet3
      .getRow(1)
      .eachCell((cell: any) => Object.assign(cell, headerStyle()));

    (reportData.allTicketsForExcel ?? []).forEach(
      (ticket: any, idx: number) => {
        const row = sheet3.addRow({
          id: ticket.id,
          title: ticket.title,
          status: statusLabel(ticket.status),
          name: ticket.user?.name ?? '-',
          email: ticket.user?.email ?? '-',
          time: formatDateID(ticket.createdAt),
          convId: ticket.conversation?.id ?? '-',
          link: `https://eppy.id/admin/tickets/${ticket.id}`,
        });

        // Conditional formatting berdasarkan status
        const statusCell = row.getCell('status');
        if (ticket.status === 'RESOLVED') {
          statusCell.font = { color: { argb: GREEN }, bold: true };
          row.eachCell((cell: any) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: LIGHT_GREEN },
            };
          });
        } else if (ticket.status === 'ON_PROGRESS') {
          statusCell.font = { color: { argb: YELLOW }, bold: true };
          row.eachCell((cell: any) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: LIGHT_YELLOW },
            };
          });
        } else if (ticket.status === 'OPEN') {
          statusCell.font = { color: { argb: RED }, bold: true };
          row.eachCell((cell: any) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: LIGHT_RED },
            };
          });
        }

        // Quick link
        const linkCell = row.getCell('link');
        linkCell.value = {
          text: 'Buka tiket',
          hyperlink: `https://eppy.id/admin/tickets/${ticket.id}`,
        };
        linkCell.font = { color: { argb: BLUE }, underline: true };
      },
    );

    // Freeze header row di semua sheet
    [sheet1, sheet2, sheet3].forEach((sheet) => {
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = formatReportFilename(
      new Date(reportData.period.startDate),
      new Date(reportData.period.endDate),
      'xlsx',
    );

    return {
      buffer: Buffer.from(buffer),
      filename,
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
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PAGE_WIDTH = 495; // A4 - margin kiri kanan
      const BLUE = '#1d4ed8';
      const GRAY = '#6b7280';
      const RED = '#dc2626';
      const GREEN = '#16a34a';
      const YELLOW = '#d97706';

      const addSection = (title: string) => {
        doc
          .moveDown(1.5)
          .fontSize(13)
          .font('Helvetica-Bold')
          .fillColor(BLUE)
          .text(title);
        doc
          .moveDown(0.2)
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .strokeColor(BLUE)
          .stroke();
        doc.moveDown(0.5).fillColor('black').fontSize(10).font('Helvetica');
      };

      const addRow = (label: string, value: string, valueColor = 'black') => {
        doc
          .font('Helvetica')
          .fillColor(GRAY)
          .text(`${label}`, { continued: true });
        doc.font('Helvetica-Bold').fillColor(valueColor).text(`  ${value}`);
        doc.fillColor('black').font('Helvetica');
      };

      // ── Header ──
      doc.rect(50, 50, PAGE_WIDTH, 70).fill(BLUE);
      doc
        .fillColor('white')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('Eppy Helpdesk', 70, 65);
      doc
        .fontSize(11)
        .font('Helvetica')
        .text('Laporan Analisis Sistem', 70, 92);

      doc
        .fillColor('white')
        .fontSize(10)
        .text(
          `Periode: ${formatDateID(reportData.period.startDate)} — ${formatDateID(reportData.period.endDate)}`,
          50,
          105,
          { align: 'right', width: PAGE_WIDTH },
        );

      doc.moveDown(5);
      doc
        .fillColor('black')
        .fontSize(9)
        .font('Helvetica')
        .fillColor(GRAY)
        .text(`Dibuat pada: ${formatDateID(reportData.generatedAt)}`, {
          align: 'right',
        });

      // ── Section 1: Ringkasan Umum ──
      addSection('1. Ringkasan Umum');
      addRow('Total Percakapan', String(reportData.totalConversations));
      addRow('Total Pesan', String(reportData.totalMessages));
      addRow('Total Tiket', String(reportData.totalTickets));
      addRow('Tingkat Eskalasi', reportData.escalationRate);

      // ── SLA Card: Waktu Respon Admin ──
      doc.moveDown(0.8);
      doc.rect(50, doc.y, PAGE_WIDTH, 36).fill('#eff6ff');
      doc
        .fillColor(BLUE)
        .fontSize(9)
        .font('Helvetica')
        .text('Rata-rata Waktu Respon Admin (SLA)', 62, doc.y - 30);
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(reportData.avgResponseTime ?? '00:00:00', 62, doc.y - 14);
      doc.moveDown(1.5);

      // ── Section 2: Kepuasan User ──
      addSection('2. Kepuasan User');
      const { helpful, notHelpful, totalFeedback } = reportData.feedbackStats;
      addRow('Total Feedback', String(totalFeedback));
      addRow('Puas (Helpful)', String(helpful), GREEN);
      addRow('Tidak Puas (Not Helpful)', String(notHelpful), RED);
      if (totalFeedback > 0) {
        const rate = ((helpful / totalFeedback) * 100).toFixed(1);
        addRow(
          'Tingkat Kepuasan',
          `${rate}%`,
          parseFloat(rate) >= 70 ? GREEN : RED,
        );
      }

      // ── Section 3: Performa Chatbot ──
      addSection('3. Performa Chatbot (Confidence Score)');

      const { avg, min, max } = reportData.confidenceStats;
      const avgColor = avg < 0.5 ? RED : avg < 0.7 ? YELLOW : GREEN;
      addRow('Rata-rata', avg.toFixed(4), avgColor);
      addRow('Minimum', min.toFixed(4));
      addRow('Maximum', max.toFixed(4));

      // Confidence Health Bar — visualisasi teks
      doc.moveDown(0.8);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('black')
        .text('Distribusi Akurasi Respons:');
      doc.moveDown(0.3);

      const { low, medium, high } = reportData.confidenceDistribution;
      const totalDist = low + medium + high || 1;
      const barWidth = PAGE_WIDTH - 20;

      const segments = [
        { label: `Rendah (${low})`, count: low, color: RED },
        { label: `Sedang (${medium})`, count: medium, color: YELLOW },
        { label: `Tinggi (${high})`, count: high, color: GREEN },
      ];

      const barY = doc.y;
      let barX = 50;
      segments.forEach(({ count, color }) => {
        const w = (count / totalDist) * barWidth;
        if (w > 0) {
          doc.rect(barX, barY, w, 16).fill(color);
          barX += w;
        }
      });

      // Legend
      doc.moveDown(1.5);
      let legendX = 50;
      segments.forEach(({ label, color }) => {
        doc.rect(legendX, doc.y, 10, 10).fill(color);
        doc
          .fillColor('black')
          .fontSize(9)
          .font('Helvetica')
          .text(label, legendX + 14, doc.y - 10);
        legendX += 120;
      });
      doc.moveDown(0.5);

      // Warning jika low > high
      if (low > high) {
        doc.moveDown(0.5);
        doc.rect(50, doc.y, PAGE_WIDTH, 24).fill('#fef2f2');
        doc
          .fillColor(RED)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('⚠ Bot butuh pelatihan data lebih lanjut', 62, doc.y - 18);
        doc
          .font('Helvetica')
          .fillColor(GRAY)
          .fontSize(8)
          .text(
            'Mayoritas respons memiliki akurasi rendah. Pertimbangkan untuk menambah atau memperbaiki dokumen knowledge base.',
            62,
            doc.y - 6,
          );
        doc.moveDown(1);
      }

      // ── Section 4: Status Tiket ──
      addSection('4. Status Tiket');
      addRow('Open (Baru)', String(reportData.ticketStats.open));
      addRow('On Progress (Aktif)', String(reportData.ticketStats.onProgress));
      addRow('Resolved (Selesai)', String(reportData.ticketStats.resolved));

      // ── Section 5: Percakapan Bermasalah ──
      const problematic = reportData.problematicConversations ?? [];
      addSection(`5. Percakapan Bermasalah (${problematic.length} percakapan)`);

      if (problematic.length === 0) {
        doc
          .fontSize(10)
          .fillColor(GREEN)
          .text(
            'Tidak ada percakapan dengan feedback negatif pada periode ini.',
          );
        doc.fillColor('black');
      } else {
        // Header tabel
        const colWidths = [170, 120, 100, 90];
        const headers = ['Judul', 'User', 'Email', 'Waktu'];
        const tableX = 50;
        let tableY = doc.y;

        doc.rect(tableX, tableY, PAGE_WIDTH, 16).fill('#fef2f2');
        let colX = tableX + 4;
        headers.forEach((h, i) => {
          doc
            .fillColor(RED)
            .fontSize(8)
            .font('Helvetica-Bold')
            .text(h, colX, tableY + 4, { width: colWidths[i] });
          colX += colWidths[i];
        });
        tableY += 16;

        problematic.forEach((conv: any, idx: number) => {
          if (tableY > 720) {
            doc.addPage();
            tableY = 50;
          }
          const rowColor = idx % 2 === 0 ? '#fff5f5' : 'white';
          doc.rect(tableX, tableY, PAGE_WIDTH, 18).fill(rowColor);
          const cells = [
            conv.title?.slice(0, 28) ?? '-',
            conv.user?.name ?? '-',
            conv.user?.email ?? '-',
            formatDateID(conv.createdAt),
          ];
          colX = tableX + 4;
          cells.forEach((cell, i) => {
            doc
              .fillColor('black')
              .fontSize(8)
              .font('Helvetica')
              .text(cell, colX, tableY + 5, { width: colWidths[i] - 4 });
            colX += colWidths[i];
          });
          tableY += 18;
        });
        doc.y = tableY + 4;
      }

      // ── Footer ──
      doc.moveDown(3);
      doc
        .fontSize(8)
        .fillColor(GRAY)
        .text(
          'Dokumen ini dibuat otomatis oleh sistem Eppy. © 2026 PT Epson Indonesia Industry',
          {
            align: 'center',
          },
        );

      doc.end();
    });

    const filename = formatReportFilename(
      new Date(reportData.period.startDate),
      new Date(reportData.period.endDate),
      'pdf',
    );
    return { buffer, filename, mimeType: 'application/pdf' };
  }
}
