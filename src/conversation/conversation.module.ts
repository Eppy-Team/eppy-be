import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationRepository } from './conversation.repository';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ConversationController],
  providers: [ConversationService, ConversationRepository, PrismaService],
  exports: [ConversationRepository], // dipakai ChatModule nanti
})
export class ConversationModule {}