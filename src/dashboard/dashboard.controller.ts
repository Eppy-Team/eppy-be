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

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard/chatbot?page=1&limit=10&status=HELPFUL
   * Data Dashboard Chatbot:
   * - Pie chart kepuasan (puas/tidak puas)
   * - Confidence score stats
   * - Tabel percakapan (filter by status feedback)
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
   * GET /dashboard/tickets?page=1&limit=10&status=OPEN
   * Data Dashboard Tiket:
   * - Summary cards (total, baru, aktif, selesai, waktu balas)
   * - Tabel tiket (filter by status)
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
   * GET /dashboard/report/export?startDate=...&endDate=...&format=pdf
   * Export laporan PDF atau Excel — response adalah file download.
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
   * GET /dashboard/report?startDate=2026-01-01&endDate=2026-05-01
   * Data laporan lengkap dalam format JSON.
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
