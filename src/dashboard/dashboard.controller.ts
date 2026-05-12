import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { TicketStatus } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * Dashboard Controller
 *
 * REST API for admin analytics and reporting. Provides endpoints for real-time dashboard
 * views and period-based report generation in JSON, PDF, and Excel formats.
 *
 * Security:
 * - Requires Admin role (via @Roles decorator).
 * - Enforces JWT authentication and role-based access control.
 * - All endpoints protected by JwtAuthGuard and RolesGuard.
 *
 * @remarks
 * Responsibilities:
 * - Chatbot analytics dashboard with satisfaction and confidence metrics.
 * - Ticket management dashboard with SLA metrics.
 * - Report generation and export (JSON, PDF, Excel).
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Retrieve chatbot performance dashboard with satisfaction and confidence metrics.
   *
   * Aggregates user satisfaction metrics (helpful/not helpful feedback distribution),
   * AI response confidence statistics, and paginated conversation list.
   *
   * @param page - Current page number (default: 1).
   * @param limit - Records per page (default: 10).
   * @param status - Optional feedback filter: 'HELPFUL' or 'NOT_HELPFUL'.
   * @returns Dashboard object with satisfaction chart, confidence scores, distribution, and conversations.
   *
   * @status 200 OK
   * @security Requires Admin role
   *
   * @example
   * GET /dashboard/chatbot?page=1&limit=10&status=HELPFUL
   */
  @Get('chatbot')
  async getChatbotDashboard(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: string, // 'HELPFUL' | 'NOT_HELPFUL' | undefined
  ) {
    return this.dashboardService.getChatbotDashboard(page, limit, status);
  }

  /**
   * Retrieve ticket management dashboard with SLA metrics and queue status.
   *
   * Aggregates ticket counts by status (OPEN, ON_PROGRESS, RESOLVED), calculates
   * average response time, and provides paginated ticket list with optional filtering.
   *
   * @param page - Current page number (default: 1).
   * @param limit - Records per page (default: 10).
   * @param status - Optional status filter: 'OPEN', 'ON_PROGRESS', or 'RESOLVED'.
   * @returns Dashboard object with ticket summary, SLA metrics, and paginated tickets.
   *
   * @status 200 OK
   * @security Requires Admin role
   *
   * @example
   * GET /dashboard/tickets?page=1&limit=10&status=OPEN
   */
  @Get('tickets')
  async getTicketDashboard(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: TicketStatus,
  ) {
    return this.dashboardService.getTicketDashboard(page, limit, status);
  }

  /**
   * Export system report in PDF or Excel format.
   *
   * Generates period-based report data and converts it to the requested file format.
   * Returns binary file stream via HTTP response with appropriate headers.
   *
   * @param startDate - Report period start (format: YYYY-MM-DD, required).
   * @param endDate - Report period end (format: YYYY-MM-DD, required).
   * @param format - Export format (required): 'pdf' or 'excel'.
   * @param res - Express Response object for streaming file data.
   * @returns File stream with Content-Type and Content-Disposition headers.
   *
   * @status 200 OK
   * @security Requires Admin role
   * @throws {BadRequestException} If dates missing, format invalid, or package missing.
   *
   * @remarks
   * Response Headers:
   * - Content-Type: application/pdf or application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
   * - Content-Disposition: attachment; filename="report_<startDate>_<endDate>.<ext>"
   * - Content-Length: File size in bytes
   *
   * File Formats:
   * - PDF: Single document with all metrics and formatted sections.
   * - Excel: Multi-sheet workbook (Overview, User Satisfaction, Chatbot Performance, Tickets).
   *
   * @example
   * GET /dashboard/report/export?startDate=2026-01-01&endDate=2026-01-31&format=pdf
   * GET /dashboard/report/export?startDate=2026-01-01&endDate=2026-01-31&format=excel
   */
  @Get('report/export')
  async exportReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate dan endDate wajib diisi');
    }
    if (format !== 'pdf' && format !== 'excel') {
      throw new BadRequestException('Format harus "pdf" atau "excel"');
    }

    const { buffer, filename, mimeType } =
      await this.dashboardService.exportReport(startDate, endDate, format);

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /**
   * Generate comprehensive system report for a date range.
   *
   * Aggregates all dashboard metrics (conversations, messages, tickets, feedback, confidence)
   * for a specified period. Returns JSON report with period metadata and escalation rate.
   *
   * @param startDate - Report period start (format: YYYY-MM-DD, required).
   * @param endDate - Report period end (format: YYYY-MM-DD, required).
   * @returns Comprehensive report JSON with period, metrics, statistics, and escalation rate.
   *
   * @status 200 OK
   * @security Requires Admin role
   * @throws {BadRequestException} If startDate/endDate missing or date format invalid.
   *
   * @example
   * GET /dashboard/report?startDate=2026-01-01&endDate=2026-01-31
   */
  @Get('report')
  async getReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'startDate dan endDate wajib diisi (format: YYYY-MM-DD)',
      );
    }
    return this.dashboardService.getReport(startDate, endDate);
  }
}
