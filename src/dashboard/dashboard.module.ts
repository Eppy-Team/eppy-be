import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { AiModule } from '../ai/ai.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dashboard Module
 *
 * Feature module for admin analytics and reporting dashboards.
 * Provides real-time KPI views, report generation, and export functionality.
 *
 * Components:
 * - DashboardController: REST API endpoints for dashboards and reports.
 * - DashboardService: Business logic for metrics aggregation and report generation.
 * - DashboardRepository: Data access layer for analytics queries.
 *
 * Dependencies:
 * - AiModule: Optional service integration for advanced analytics.
 * - PrismaService: Database client for ORM operations.
 *
 * @remarks
 * Features:
 * - Chatbot Dashboard: User satisfaction metrics and confidence statistics.
 * - Ticket Dashboard: Queue status and SLA performance tracking.
 * - Report Generation: Period-based reports with aggregated metrics.
 * - Export Functionality: PDF and Excel format support.
 */
@Module({
  imports: [AiModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository, PrismaService],
})
export class DashboardModule {}
