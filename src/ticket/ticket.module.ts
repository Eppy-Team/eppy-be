import { Module } from '@nestjs/common';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { TicketRepository } from './ticket.repository';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [TicketController],
  providers: [TicketService, TicketRepository, PrismaService],
})
export class TicketModule {}