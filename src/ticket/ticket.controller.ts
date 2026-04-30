import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { RespondTicketDto } from './dto/respond-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  // ─── User endpoints ───────────────────────────────────────────────────────

  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    return this.ticketService.findAllByUser(userId);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ticketService.findByIdForUser(id, userId);
  }

  @Post()
  async create(
    @Body() dto: CreateTicketDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ticketService.create(dto, userId);
  }

  // ─── Admin endpoints ──────────────────────────────────────────────────────

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAllAdmin() {
    return this.ticketService.findAll();
  }

  @Get('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async findOneAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.ticketService.findByIdForAdmin(id);
  }

  @Patch('admin/:id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.ticketService.updateStatus(id, dto);
  }

  @Patch('admin/:id/respond')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondTicketDto,
  ) {
    return this.ticketService.respond(id, dto);
  }
}