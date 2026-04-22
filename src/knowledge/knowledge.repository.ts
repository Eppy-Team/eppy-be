import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, EmbeddingStatus } from '@prisma/client';

@Injectable()
export class KnowledgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { skip?: number; take?: number }) {
    const { skip, take } = params;

    const [articles, total] = await Promise.all([
      this.prisma.knowledgeArticle.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          category: true,
          fileUrl: true,
          embeddingStatus: true,
          createdAt: true,
          updatedAt: true,
          author: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.knowledgeArticle.count(),
    ]);

    return { articles, total };
  }

  async findById(id: string) {
    return this.prisma.knowledgeArticle.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        fileUrl: true,
        fileKey: true,
        embeddingStatus: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async create(data: {
    title: string;
    category: string;
    fileUrl: string;
    fileKey: string;
    createdBy: string;
  }) {
    return this.prisma.knowledgeArticle.create({
      data: {
        title: data.title,
        category: data.category,
        fileUrl: data.fileUrl,
        fileKey: data.fileKey,
        createdBy: data.createdBy,
        embeddingStatus: EmbeddingStatus.PENDING,
      },
      select: {
        id: true,
        title: true,
        category: true,
        fileUrl: true,
        embeddingStatus: true,
        createdAt: true,
      },
    });
  }

  async update(id: string, data: Prisma.KnowledgeArticleUpdateInput) {
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        category: true,
        fileUrl: true,
        embeddingStatus: true,
        updatedAt: true,
      },
    });
  }

  async updateEmbeddingStatus(id: string, status: EmbeddingStatus) {
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: { embeddingStatus: status },
    });
  }

  async delete(id: string) {
    return this.prisma.knowledgeArticle.delete({
      where: { id },
    });
  }
}
