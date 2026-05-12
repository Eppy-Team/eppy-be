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
import { Response } from 'express';
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
}