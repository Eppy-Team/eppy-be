import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { AiModule } from '../ai/ai.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [AiModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository, PrismaService],
})
export class DashboardModule {}