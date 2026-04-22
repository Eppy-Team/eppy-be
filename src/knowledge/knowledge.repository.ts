import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, EmbeddingStatus } from '@prisma/client';

/**
 * Knowledge Repository
 *
 * Data Access Layer for the `knowledge_article` table in the database.
 * Handles all database interactions using Prisma ORM.
 *
 * Responsibilities:
 * - Query operations (findAll, findById, findMany)
 * - Write operations (create, update, delete)
 * - State mutations (updateEmbeddingStatus)
 */
@Injectable()
export class KnowledgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve a paginated list of articles.
   *
   * @param params.skip - Offset for pagination.
   * @param params.take - Limit on the number of records to retrieve.
   * @returns An object containing the articles array and the total count.
   *
   * @remarks
   * Results are sorted by `createdAt` in descending order (newest first).
   * Uses minimal field selection to optimize query performance.
   */
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

  /**
   * Retrieve a single article with comprehensive details.
   *
   * @param id - The article's UUID.
   * @returns The full article object or null if not found.
   *
   * @remarks
   * Includes the `fileKey` field, which is required for storage deletion operations.
   */
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

  /**
   * Create a new knowledge article record.
   *
   * @param data - Article data including title, category, fileUrl, fileKey, and createdBy.
   * @returns The created article object with selected fields.
   *
   * @remarks
   * Embedding status is automatically set to PENDING upon creation.
   * Returns only selected fields (excludes sensitive or unnecessary internal data).
   */
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

  /**
   * Update an existing knowledge article.
   *
   * @param id - The article's UUID.
   * @param data - Prisma update input containing partial article fields.
   * @returns The updated article object with selected fields.
   *
   * @remarks
   * Supports flexible updates via Prisma. The Service layer is responsible
   * for validation and overarching business logic.
   */
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

  /**
   * Update the embedding status of an article.
   *
   * @param id - The article's UUID.
   * @param status - The new embedding status (PENDING, PROCESSING, DONE, FAILED).
   * @returns The updated article record.
   *
   * @remarks
   * A dedicated method for the state management of the background embedding process.
   */
  async updateEmbeddingStatus(id: string, status: EmbeddingStatus) {
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: { embeddingStatus: status },
    });
  }

  /**
   * Delete an article by its unique identifier.
   *
   * @param id - The article's UUID.
   * @returns The deleted article object.
   *
   * @remarks
   * Performs a hard delete from the database. Associated files and embeddings
   * must be handled separately by the service layer.
   */
  async delete(id: string) {
    return this.prisma.knowledgeArticle.delete({
      where: { id },
    });
  }
}
