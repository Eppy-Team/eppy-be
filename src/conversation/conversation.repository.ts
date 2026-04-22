import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUserId(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        // ambil preview pesan terakhir
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async findById(id: string, userId: string) {
    return this.prisma.conversation.findFirst({
      where: { id, userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });
  }

  async findMessages(conversationId: string, userId: string) {
    // Pastikan conversation milik user yang request
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });

    if (!conversation) return null;

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        imageUrl: true,
        confidenceScore: true,
        createdAt: true,
      },
    });
  }

  async create(data: { userId: string; title: string }) {
    return this.prisma.conversation.create({
      data: {
        userId: data.userId,
        title: data.title,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });
  }
}