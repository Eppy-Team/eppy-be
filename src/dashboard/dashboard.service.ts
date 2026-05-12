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
  return [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
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

  // ─── GET /dashboard/tickets ───────────────────────────────────────────────
  // Data untuk Dashboard Tiket (summary cards + tabel tiket)

  async getTicketDashboard(page: number, limit: number, status?: TicketStatus) {
    const [ticketStats, avgResponseTimeMs, ticketsData] = await Promise.all([
      this.dashboardRepository.getTicketStats(),
      this.dashboardRepository.getAverageResponseTime(),
      this.dashboardRepository.getAllTickets(page, limit, status),
    ]);

    return {
      message: 'Ticket dashboard retrieved successfully',
      data: {
        // Summary cards sesuai HiFi
        summary: {
          total: ticketStats.total,
          open: ticketStats.open, // "Tiket Baru"
          onProgress: ticketStats.onProgress, // "Tiket Aktif"
          resolved: ticketStats.resolved, // "Tiket Selesai"
          avgResponseTime: msToHHMMSS(avgResponseTimeMs), // "Waktu Balas" format HH:MM:SS
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

  // ─── GET /dashboard/report ────────────────────────────────────────────────

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
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ─── GET /dashboard/report/export ─────────────────────────────────────────

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

  // ─── Private: Excel ───────────────────────────────────────────────────────

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

    // Sheet 1: Overview
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

    // Sheet 2: Kepuasan User
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

    // Sheet 3: Performa Chatbot
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

    // Sheet 4: Status Tiket
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

  // ─── Private: PDF ─────────────────────────────────────────────────────────

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

      // Header
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
