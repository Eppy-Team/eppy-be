import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { DashboardRepository } from './dashboard.repository';
import { AiService } from '../ai/ai.service';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert milliseconds to HH:MM:SS format.
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
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
}

/**
 * Format date to Indonesian locale with WIB timezone.
 *
 * @param date - Date object or ISO string to format.
 * @returns Formatted string (e.g., "14 Mei 2026, 10:30 WIB").
 *
 * @remarks
 * - Applies WIB timezone offset (+07:00) to UTC date.
 * - Uses Indonesian month names.
 * - Includes time component (HH:MM format) with WIB suffix.
 * - Used in PDF headers, Excel cells, and report formatting.
 */
function formatDateID(date: Date | string): string {
  const d = new Date(date);
  
  const wibOffset = 7 * 60 * 60 * 1000;
  const wib = new Date(d.getTime() + wibOffset);

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const day = wib.getUTCDate();
  const month = months[wib.getUTCMonth()];
  const year = wib.getUTCFullYear();
  const hours = String(wib.getUTCHours()).padStart(2, '0');
  const minutes = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes} WIB`;
}

/**
 * Format report filename with period range.
 *
 * @param startDate - Report period start date.
 * @param endDate - Report period end date.
 * @param ext - File extension ('xlsx' or 'pdf').
 * @returns Formatted filename (e.g., "Eppy_Report_Januari_2026.xlsx").
 *
 * @remarks
 * - Uses Indonesian month names.
 * - If start and end in same month/year, uses single month format.
 * - Otherwise uses range format: Januari_2026-Mei_2026.
 * - Filename prefix: "Eppy_Report_".
 */
function formatReportFilename(startDate: Date, endDate: Date, ext: string): string {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
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

/**
 * Convert feedback enum value to Indonesian label.
 *
 * @param feedback - Feedback value ('HELPFUL', 'NOT_HELPFUL', or null).
 * @returns Indonesian label: 'Puas', 'Tidak Puas', or '-' for null.
 *
 * @remarks
 * Used in Excel and PDF report generation for feedback display.
 */
function feedbackLabel(feedback: string | null): string {
  if (feedback === 'HELPFUL') return 'Puas';
  if (feedback === 'NOT_HELPFUL') return 'Tidak Puas';
  return '-';
}

/**
 * Convert ticket status enum value to Indonesian label.
 *
 * @param status - Ticket status string ('OPEN', 'ON_PROGRESS', 'RESOLVED').
 * @returns Indonesian label: 'Baru', 'Aktif', 'Selesai', or original status if unmapped.
 *
 * @remarks
 * Used in Excel and PDF report generation for ticket status display.
 */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'Baru',
    ON_PROGRESS: 'Aktif',
    RESOLVED: 'Selesai',
  };
  return map[status] ?? status;
}

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
   * bot accuracy assessment, and paginated conversation list. Supports filtering by feedback status.
   *
   * @param page - Current page number (1-indexed, default: 1).
   * @param limit - Records per page (default: 10).
   * @param status - Optional feedback filter: 'HELPFUL' or 'NOT_HELPFUL'.
   * @returns Dashboard object with satisfaction metrics, confidence data, bot accuracy warning, and conversations list.
   *
   * @status 200 OK
   * @remarks
   * Metrics Aggregation:
   * - Satisfaction Chart: Helpful/not-helpful counts with percentage calculation.
   * - Confidence Score: Average, minimum, maximum (4 decimal precision).
   * - Confidence Distribution: Counts in low/medium/high brackets.
   * - Bot Accuracy: Assessment with status (LOW/MEDIUM/HIGH) and warning message.
   * - Conversations: Paginated with user info and last feedback status.
   *
   * Bot Accuracy Status:
   * - LOW (< 0.5): "Bot butuh pelatihan data lebih lanjut"
   * - MEDIUM (0.5-0.7): "Performa bot cukup, masih bisa dioptimasi"
   * - HIGH (≥ 0.7): "Performa bot baik"
   *
   * Performance: Parallel execution of 4 independent queries for fast response.
   * Logging: debug (entry), log (success with helpful_count, avg_confidence, total_conversations).
   */
  async getChatbotDashboard(page: number, limit: number, status?: string) {

    const formattedStatus = status ? status.toUpperCase() : undefined;

    if (formattedStatus && formattedStatus !== 'HELPFUL' && formattedStatus !== 'NOT_HELPFUL') {
      throw new BadRequestException('Status filter harus "HELPFUL" atau "NOT_HELPFUL"');
    }

    const [feedbackStats, confidenceStats, confidenceDistribution, conversationsData] =
      await Promise.all([
        this.dashboardRepository.getFeedbackStats(),
        this.dashboardRepository.getConfidenceStats(),
        this.dashboardRepository.getConfidenceDistribution(),
        this.dashboardRepository.getAllConversations(page, limit, formattedStatus),
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
   * Logging: debug (entry), log (success with ticket_counts and avg_response_time).
   */
  async getTicketDashboard(page: number, limit: number, status?: TicketStatus) {
    let formattedStatus: any = undefined;
    if (status) {
      formattedStatus = status.replace(/[-\s]/g, '_').toUpperCase();
    }

    const validStatuses = ['OPEN', 'ON_PROGRESS', 'RESOLVED'];
    if (formattedStatus && !validStatuses.includes(formattedStatus)) {
      throw new BadRequestException(
        'Status tiket harus berupa "OPEN", "ON_PROGRESS", atau "RESOLVED"'
      );
    }
    const [ticketStats, avgResponseTimeMs, ticketsData] = await Promise.all([
      this.dashboardRepository.getTicketStats(),
      this.dashboardRepository.getAverageResponseTime(),
      this.dashboardRepository.getAllTickets(page, limit, formattedStatus),
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
   * [STEP 1] Validate date string format (YYYY-MM-DD).
   * [STEP 2] Validate date logic (start <= end).
   * [STEP 3] Normalize end date to 23:59:59.999 for inclusive range.
   * [STEP 4] Fetch all report data from repository (11 concurrent queries).
   * [STEP 5] Calculate escalation rate (tickets per conversation).
   * [STEP 6] Convert avgResponseTimeMs to HH:MM:SS format.
   * [STEP 7] Return report with metadata and all aggregated metrics.
   *
   * Response Fields:
   * - period: { startDate, endDate } for audit trail.
   * - Counts: totalConversations, totalMessages, totalTickets, escalationRate.
   * - Stats: ticketStats, feedbackStats, confidenceStats, confidenceDistribution.
   * - Performance: avgResponseTime (HH:MM:SS format), avgResponseTimeMs (raw).
   * - Lists: problematicConversations, allConversationsForExcel, allTicketsForExcel.
   * - generatedAt: ISO timestamp of report generation.
   *
   * Escalation Rate: (totalTickets / totalConversations) * 100 (percentage).
   */
  async getReport(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Format tanggal tidak valid. Gunakan YYYY-MM-DD');
    }
    if (start > end) {
      throw new BadRequestException('startDate tidak boleh lebih besar dari endDate');
    }
    end.setHours(23, 59, 59, 999);

    const reportData = await this.dashboardRepository.getReportData(start, end);
    const escalationRate =
      reportData.totalConversations > 0
        ? ((reportData.totalTickets / reportData.totalConversations) * 100).toFixed(2)
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
   * [STEP 1] Call getReport() to validate dates and fetch aggregated data.
   * [STEP 2] Route to format-specific generator (generateExcel or generatePdf).
   * [STEP 3] Return binary buffer with appropriate HTTP headers metadata.
   *
   * File Format:
   * - Excel: Multi-sheet workbook (Ringkasan, Daftar Percakapan, Daftar Tiket).
   * - PDF: Single document with all metrics and formatted sections.
   *
   * Dependencies: exceljs (for Excel), pdfkit (for PDF).
   * Logging: debug (entry), log (success with filename/size), error (export failure).
   */
  async exportReport(
    startDate: string,
    endDate: string,
    format: 'pdf' | 'excel',
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const { data: reportData } = await this.getReport(startDate, endDate);
    return format === 'excel' ? this.generateExcel(reportData) : this.generatePdf(reportData);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE: PDF GENERATION
  // ─────────────────────────────────────────────────────────────────────────────

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
   * Flow:
   * [STEP 1] Import PDFKit package (throw if not installed).
   * [STEP 2] Create PDF document with A4 size and 50px margins.
   * [STEP 3] Set up event listeners (data/end/error) for buffer collection.
   * [STEP 4] Render header section with report title and period.
   * [STEP 5] Render Section 1: System Overview (conversation/message/ticket counts, escalation rate, response time SLA).
   * [STEP 6] Render Section 2: User Satisfaction (feedback distribution with percentages).
   * [STEP 7] Render Section 3: Chatbot Performance (confidence stats and distribution breakdown).
   * [STEP 8] Render Section 4: Ticket Management (status breakdown with color indicators).
   * [STEP 9] Render Section 5: Problematic Conversations (with negative feedback).
   * [STEP 10] Close document to trigger 'end' event and resolve promise.
   *
   * Content Structure:
   * - Header: Report title, period, and generation timestamp (blue banner).
   * - Section 1: System Overview (conversations, messages, tickets, escalation rate).
   * - Section 2: User Satisfaction (feedback distribution with percentages).
   * - Section 3: Chatbot Performance (confidence metrics and distribution).
   * - Section 4: Ticket Management (status breakdown and metrics).
   * - Section 5: Problematic Conversations (NOT_HELPFUL conversations list).
   *
   * Formatting: Formatted text, colored sections, page breaks, timestamps.
   * Color Scheme: Blue (#1D4ED8) headers, red/green/yellow status indicators.
   * Filename: Eppy_Report_<Period>.pdf (Indonesian month names).
   * Page Layout: A4, 50px margins, width 495px for content.
   *
   * Logging: debug (start), debug (pdf_generated with file_size_bytes), error (doc generation error).
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
      throw new BadRequestException('Jalankan: npm install pdfkit @types/pdfkit');
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const LEFT = 50;
      const RIGHT = 545;
      const WIDTH = RIGHT - LEFT;
      const BLUE = '#1d4ed8';
      const GRAY = '#6b7280';
      const LIGHT_GRAY = '#f3f4f6';
      const RED = '#dc2626';
      const GREEN = '#16a34a';
      const YELLOW = '#d97706';
      const LIGHT_RED = '#fef2f2';
      const LIGHT_BLUE = '#eff6ff';

      // ─── Helper functions ───────────────────────────────────────────────

      const sectionTitle = (title: string) => {
        doc.moveDown(1.2);
        doc.fontSize(12).font('Helvetica-Bold').fillColor(BLUE).text(title, LEFT);
        const lineY = doc.y + 2;
        doc.moveTo(LEFT, lineY).lineTo(RIGHT, lineY).strokeColor(BLUE).lineWidth(1).stroke();
        doc.moveDown(0.6).fillColor('#111827').fontSize(10).font('Helvetica');
      };

      const labelValue = (label: string, value: string, valueColor = '#111827') => {
        const y = doc.y;
        doc.fontSize(10).font('Helvetica').fillColor(GRAY).text(label, LEFT, y, { width: 220 });
        doc.fontSize(10).font('Helvetica-Bold').fillColor(valueColor).text(value, 270, y, { width: 275 });
        doc.moveDown(0.4);
      };

      const drawBox = (y: number, height: number, color: string) => {
        doc.rect(LEFT, y, WIDTH, height).fill(color);
      };

      // ─── Header ────────────────────────────────────────────────────────

      doc.rect(LEFT, 45, WIDTH, 65).fill(BLUE);

      doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
        .text('Eppy Helpdesk', LEFT + 12, 55, { width: WIDTH - 24 });

      doc.fontSize(10).font('Helvetica').fillColor('#bfdbfe')
        .text('Laporan Analisis Sistem', LEFT + 12, 78, { width: WIDTH - 24 });

      doc.fontSize(9).fillColor('white')
        .text(
          `Periode: ${formatDateID(reportData.period.startDate)} — ${formatDateID(reportData.period.endDate)}`,
          LEFT + 12, 92, { width: WIDTH - 24, align: 'right' },
        );

      doc.y = 120;
      doc.fontSize(8).font('Helvetica').fillColor(GRAY)
        .text(`Dibuat pada: ${formatDateID(reportData.generatedAt)}`, LEFT, doc.y, {
          width: WIDTH, align: 'right',
        });

      // ─── Section 1: Overview ─────────────────────────────────────

      sectionTitle('1.  Ringkasan Umum');
      labelValue('Total Percakapan', String(reportData.totalConversations));
      labelValue('Total Pesan', String(reportData.totalMessages));
      labelValue('Total Tiket', String(reportData.totalTickets));
      labelValue('Tingkat Eskalasi', reportData.escalationRate);

      // SLA Card
      doc.moveDown(0.5);
      const slaY = doc.y;
      doc.rect(LEFT, slaY, WIDTH, 38).fill(LIGHT_BLUE);
      doc.fontSize(8).font('Helvetica').fillColor(BLUE)
        .text('RATA-RATA WAKTU RESPON ADMIN (SLA)', LEFT + 12, slaY + 8, { width: WIDTH - 24 });
      doc.fontSize(18).font('Helvetica-Bold').fillColor(BLUE)
        .text(reportData.avgResponseTime ?? '00:00:00', LEFT + 12, slaY + 19, { width: WIDTH - 24 });
      doc.y = slaY + 44;

      // ─── Section 2: User Satisfaction ──────────────────────────────────────

      sectionTitle('2.  Kepuasan User');

      const fb = reportData.feedbackStats;
      const totalFb = fb.total ?? 0;
      const helpfulRate = totalFb > 0
        ? `${((fb.helpful / totalFb) * 100).toFixed(1)}%`
        : '0%';

      labelValue('Total Feedback Diterima', String(totalFb));
      labelValue('Puas (Helpful)', String(fb.helpful), GREEN);
      labelValue('Tidak Puas (Not Helpful)', String(fb.notHelpful), RED);
      labelValue('Tingkat Kepuasan', helpfulRate, parseFloat(helpfulRate) >= 70 ? GREEN : RED);

      // ─── Section 3: Chatbot Performance ───────────────────────────────────

      sectionTitle('3.  Performa Chatbot (Confidence Score)');

      const { avg, min, max } = reportData.confidenceStats;
      const avgColor = avg < 0.5 ? RED : avg < 0.7 ? YELLOW : GREEN;
      labelValue('Rata-rata Confidence Score', avg.toFixed(4), avgColor);
      labelValue('Minimum', min.toFixed(4));
      labelValue('Maximum', max.toFixed(4));

      doc.moveDown(0.6);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151').text('Distribusi Akurasi Respons:', LEFT);
      doc.moveDown(0.4);

      const { low, medium, high } = reportData.confidenceDistribution;
      const totalDist = (low + medium + high) || 1;
      const BAR_HEIGHT = 18;
      const barY = doc.y;

      let barX = LEFT;
      const segments = [
        { count: low, color: RED },
        { count: medium, color: YELLOW },
        { count: high, color: GREEN },
      ];
      segments.forEach(({ count, color }) => {
        const segW = Math.round((count / totalDist) * WIDTH);
        if (segW > 0) {
          doc.rect(barX, barY, segW, BAR_HEIGHT).fill(color);
          barX += segW;
        }
      });

      if (barX < RIGHT) {
        doc.rect(barX, barY, RIGHT - barX, BAR_HEIGHT).fill(segments[segments.length - 1].color);
      }

      doc.y = barY + BAR_HEIGHT + 6;

      const legendItems = [
        { label: `Rendah (${low}) — confidence 0.0 s.d 0.4`, color: RED },
        { label: `Sedang (${medium}) — confidence 0.4 s.d 0.7`, color: YELLOW },
        { label: `Tinggi (${high}) — confidence 0.7 s.d 1.0`, color: GREEN },
      ];
      legendItems.forEach(({ label, color }) => {
        const lY = doc.y;
        doc.rect(LEFT, lY + 2, 10, 10).fill(color);
        doc.fontSize(8).font('Helvetica').fillColor('#374151')
          .text(label, LEFT + 16, lY, { width: WIDTH - 16 });
        doc.moveDown(0.35);
      });

      if (low > high) {
        doc.moveDown(0.5);
        const warnY = doc.y;
        doc.rect(LEFT, warnY, WIDTH, 32).fill(LIGHT_RED);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(RED)
          .text('PERINGATAN: Bot butuh pelatihan data lebih lanjut', LEFT + 10, warnY + 6, {
            width: WIDTH - 20,
          });
        doc.fontSize(8).font('Helvetica').fillColor('#7f1d1d')
          .text(
            'Mayoritas respons memiliki akurasi rendah. Pertimbangkan untuk menambah atau memperbaiki dokumen knowledge base.',
            LEFT + 10, warnY + 18, { width: WIDTH - 20 },
          );
        doc.y = warnY + 38;
      }

      // ─── Section 4: Ticket Status ───────────────────────────────────────

      sectionTitle('4.  Status Tiket');
      labelValue('Open / Baru', String(reportData.ticketStats.open));
      labelValue('On Progress / Aktif', String(reportData.ticketStats.onProgress));
      labelValue('Resolved / Selesai', String(reportData.ticketStats.resolved));

      // ─── Section 5: Problematic Conversations ─────────────────────────────

      const problematic = reportData.problematicConversations ?? [];
      sectionTitle(`5.  Percakapan Bermasalah (${problematic.length})`);

      if (problematic.length === 0) {
        doc.fontSize(10).fillColor(GREEN)
          .text('Tidak ada percakapan dengan feedback negatif pada periode ini.', LEFT);
      } else {
        const colW = [185, 110, 140, 60];
        const headers = ['Judul', 'User', 'Email', 'Pesan'];
        const tblY = doc.y;

        doc.rect(LEFT, tblY, WIDTH, 16).fill('#fee2e2');
        let cx = LEFT + 4;
        headers.forEach((h, i) => {
          doc.fontSize(8).font('Helvetica-Bold').fillColor(RED)
            .text(h, cx, tblY + 4, { width: colW[i] - 4 });
          cx += colW[i];
        });

        let rowY = tblY + 16;
        problematic.forEach((conv: any, idx: number) => {
          if (rowY > 710) {
            doc.addPage();
            rowY = 50;
          }
          const rowBg = idx % 2 === 0 ? '#fff5f5' : 'white';
          doc.rect(LEFT, rowY, WIDTH, 18).fill(rowBg);
          const cells = [
            (conv.title ?? '-').slice(0, 30),
            (conv.user?.name ?? '-').slice(0, 18),
            (conv.user?.email ?? '-').slice(0, 26),
            String(conv._count?.messages ?? 0),
          ];
          cx = LEFT + 4;
          cells.forEach((cell, i) => {
            doc.fontSize(8).font('Helvetica').fillColor('#111827')
              .text(cell, cx, rowY + 5, { width: colW[i] - 8 });
            cx += colW[i];
          });
          rowY += 18;
        });
        doc.y = rowY + 6;
      }

      // ─── Footer ────────────────────────────────────────────────────────

      doc.moveDown(2);
      doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      doc.fontSize(8).font('Helvetica').fillColor(GRAY)
        .text(
          'Dokumen ini dibuat otomatis oleh sistem Eppy | © 2026 PT Epson Indonesia. All rights reserved.',
          LEFT, doc.y, { width: WIDTH, align: 'center' },
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

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE: EXCEL GENERATION
  // ─────────────────────────────────────────────────────────────────────────────

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
   * Flow:
   * [STEP 1] Import ExcelJS package (throw if not installed).
   * [STEP 2] Create workbook with metadata (creator, timestamp).
   * [STEP 3] Add Sheet 1 (Ringkasan): Period range, aggregated counts, response time, feedback, confidence stats.
   * [STEP 4] Add Sheet 2 (Daftar Percakapan): Conversations table with feedback status, conditional colors, hyperlinks.
   * [STEP 5] Add Sheet 3 (Daftar Tiket): Tickets table with status breakdown, color-coding, quick links.
   * [STEP 6] Freeze header rows on all sheets for navigation.
   * [STEP 7] Serialize to Buffer and generate filename.
   * [STEP 8] Return buffer, filename, and Excel MIME type.
   *
   * Sheet Structure:
   * 1. Ringkasan: Period range, conversation/message/ticket counts, escalation rate, SLA metrics.
   * 2. Daftar Percakapan: Paginated conversations with feedback metadata, quick links.
   * 3. Daftar Tiket: Paginated tickets with status breakdown, quick links.
   *
   * Formatting: Bold headers, fixed column widths, date formatting, conditional row colors.
   * Color Scheme: Blue (#1D4ED8) headers, red/green/yellow status indicators.
   * Filename: Eppy_Report_<Period>.xlsx (Indonesian month names).
   * Quick Links: Excel hyperlinks to admin panel for conversations and tickets.
   *
   * Logging: debug (start), debug (workbook_generated with sheet_count and file_size).
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

    const C = {
      BLUE: 'FF1D4ED8',
      WHITE: 'FFFFFFFF',
      GREEN: 'FF16A34A',
      YELLOW: 'FFD97706',
      RED: 'FFDC2626',
      LIGHT_GREEN: 'FFF0FDF4',
      LIGHT_YELLOW: 'FFFEFCE8',
      LIGHT_RED: 'FFFEF2F2',
      LIGHT_GRAY: 'FFF9FAFB',
    };

    const headerStyle = (bgColor = C.BLUE) => ({
      font: { bold: true, color: { argb: C.WHITE }, size: 11 },
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: bgColor } },
      alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
      border: { bottom: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } } },
    });

    // ── Sheet 1: Overview ──────────────────────────────────────────────────
    const sheet1 = workbook.addWorksheet('Ringkasan');
    sheet1.columns = [
      { key: 'metric', width: 42 },
      { key: 'value', width: 28 },
    ];
    sheet1.getRow(1).values = ['Metrik', 'Nilai'];
    sheet1.getRow(1).height = 22;
    sheet1.getRow(1).eachCell((cell: any) => Object.assign(cell, headerStyle()));

    const fb = reportData.feedbackStats;
    const summaryRows = [
      ['Periode', `${formatDateID(reportData.period.startDate)} — ${formatDateID(reportData.period.endDate)}`],
      ['Dibuat Pada', formatDateID(reportData.generatedAt)],
      ['', ''],
      ['RINGKASAN UMUM', ''],
      ['Total Percakapan', reportData.totalConversations],
      ['Total Pesan', reportData.totalMessages],
      ['Total Tiket', reportData.totalTickets],
      ['Tingkat Eskalasi', reportData.escalationRate],
      ['Rata-rata Waktu Respon Admin (SLA)', reportData.avgResponseTime ?? '-'],
      ['', ''],
      ['KEPUASAN USER', ''],
      ['Total Feedback', fb.total ?? 0],
      ['Puas (Helpful)', fb.helpful],
      ['Tidak Puas (Not Helpful)', fb.notHelpful],
      ['', ''],
      ['PERFORMA CHATBOT', ''],
      ['Avg Confidence Score', reportData.confidenceStats.avg.toFixed(4)],
      ['Min Confidence Score', reportData.confidenceStats.min.toFixed(4)],
      ['Max Confidence Score', reportData.confidenceStats.max.toFixed(4)],
      ['Akurasi Rendah (0.0 - 0.4)', reportData.confidenceDistribution.low],
      ['Akurasi Sedang (0.4 - 0.7)', reportData.confidenceDistribution.medium],
      ['Akurasi Tinggi (0.7 - 1.0)', reportData.confidenceDistribution.high],
      ['', ''],
      ['STATUS TIKET', ''],
      ['Open / Baru', reportData.ticketStats.open],
      ['On Progress / Aktif', reportData.ticketStats.onProgress],
      ['Resolved / Selesai', reportData.ticketStats.resolved],
    ];

    summaryRows.forEach(([metric, value], i) => {
      const row = sheet1.addRow({ metric, value });
      if (['RINGKASAN UMUM', 'KEPUASAN USER', 'PERFORMA CHATBOT', 'STATUS TIKET'].includes(metric as string)) {
        row.getCell('metric').font = { bold: true, color: { argb: C.BLUE } };
        row.getCell('metric').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EFFE' } };
      } else if (metric !== '' && i % 2 === 0) {
        row.getCell('metric').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.LIGHT_GRAY } };
      }
    });

    // ── Sheet 2: List of Conversations ──────────────────────────────────────────
    const sheet2 = workbook.addWorksheet('Daftar Percakapan');
    sheet2.columns = [
      { header: 'ID Percakapan', key: 'id', width: 38 },
      { header: 'Nama User', key: 'name', width: 22 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Jumlah Pesan', key: 'msgCount', width: 16 },
      { header: 'Feedback Terakhir', key: 'feedback', width: 20 },
      { header: 'Waktu', key: 'time', width: 28 },
      { header: 'Quick Link', key: 'link', width: 40 },
    ];
    sheet2.getRow(1).height = 22;
    sheet2.getRow(1).eachCell((cell: any) => Object.assign(cell, headerStyle()));

    (reportData.allConversationsForExcel ?? []).forEach((conv: any, idx: number) => {
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

      if (fb === 'NOT_HELPFUL') {
        row.eachCell((cell: any) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.LIGHT_RED } };
        });
        row.getCell('feedback').font = { color: { argb: C.RED }, bold: true };
      } else if (fb === 'HELPFUL') {
        row.getCell('feedback').font = { color: { argb: C.GREEN }, bold: true };
      } else if (idx % 2 === 0) {
        row.eachCell((cell: any) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.LIGHT_GRAY } };
        });
      }

      const linkCell = row.getCell('link');
      linkCell.value = {
        text: 'Buka percakapan',
        hyperlink: `https://eppy.id/admin/conversations/${conv.id}`,
      };
      linkCell.font = { color: { argb: C.BLUE }, underline: true };
    });

    // ── Sheet 3: List of Tickets ───────────────────────────────────────────────
    const sheet3 = workbook.addWorksheet('Daftar Tiket');
    sheet3.columns = [
      { header: 'ID Tiket', key: 'id', width: 38 },
      { header: 'Judul', key: 'title', width: 35 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Nama User', key: 'name', width: 22 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Waktu Dibuat', key: 'time', width: 28 },
      { header: 'ID Percakapan', key: 'convId', width: 38 },
      { header: 'Quick Link', key: 'link', width: 40 },
    ];
    sheet3.getRow(1).height = 22;
    sheet3.getRow(1).eachCell((cell: any) => Object.assign(cell, headerStyle()));

    (reportData.allTicketsForExcel ?? []).forEach((ticket: any) => {
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

      const statusCell = row.getCell('status');
      if (ticket.status === 'RESOLVED') {
        row.eachCell((cell: any) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.LIGHT_GREEN } };
        });
        statusCell.font = { color: { argb: C.GREEN }, bold: true };
      } else if (ticket.status === 'ON_PROGRESS') {
        row.eachCell((cell: any) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.LIGHT_YELLOW } };
        });
        statusCell.font = { color: { argb: C.YELLOW }, bold: true };
      } else {
        row.eachCell((cell: any) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.LIGHT_RED } };
        });
        statusCell.font = { color: { argb: C.RED }, bold: true };
      }

      const linkCell = row.getCell('link');
      linkCell.value = {
        text: 'Buka tiket',
        hyperlink: `https://eppy.id/admin/tickets/${ticket.id}`,
      };
      linkCell.font = { color: { argb: C.BLUE }, underline: true };
    });

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
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}