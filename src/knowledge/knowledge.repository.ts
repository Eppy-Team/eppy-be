import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, EmbeddingStatus } from '@prisma/client';

/**
 * Knowledge Repository
 *
 * Data Access Layer for the `knowledge_article` entity.
 * Encapsulates all direct database interactions using Prisma ORM, providing
 * optimized queries and consistent state mutations.
 *
 * Responsibilities:
 * - Paginated data retrieval with total count aggregation.
 * - Resource creation with initial state management.
 * - Targeted metadata and status updates.
 * - Hard deletion of article records.
 *
 * Dependencies:
 * - PrismaService: Core database engine client.
 */
@Injectable()
export class KnowledgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve a paginated list of knowledge articles.
   * * Executes a concurrent query for both data and total record count to optimize
   * pagination metadata generation in the service layer.
   *
   * @param params - Pagination parameters (skip, take).
   * @returns An object containing the article array and the global count.
   *
   * @remarks
   * - Performance: Uses explicit field selection to reduce database I/O.
   * - Ordering: Sorted by `createdAt` in descending order by default.
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
   * Retrieve a single knowledge article by its unique identifier.
   *
   * @param id - The article UUID.
   * @returns The article object with full metadata or null if not found.
   *
   * @remarks
   * Includes the `fileKey` field, which is essential for external resource 
   * cleanup (S3) in the service layer.
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
   * Persist a new knowledge article record.
   *
   * @param data - Payload for creating an article, including ownership and file references.
   * @returns The newly created article record with essential fields.
   *
   * @remarks
   * - Default State: `embeddingStatus` is initialized to `PENDING`.
   * - Audit: Maps `createdBy` to the authenticated admin user.
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
   * Update metadata for an existing knowledge article.
   *
   * @param id - The article UUID.
   * @param data - Partial update input following Prisma's schema.
   * @returns The updated article record.
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
   * Atomic update for the article's embedding lifecycle status.
   *
   * @param id - The article UUID.
   * @param status - The target state (PENDING, PROCESSING, DONE, FAILED).
   * @returns The updated record reflecting the new status.
   *
   * @remarks
   * This dedicated method is used by the AI orchestration service to 
   * track background processing progress.
   */
  async updateEmbeddingStatus(id: string, status: EmbeddingStatus) {
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: { embeddingStatus: status },
    });
  }

  /**
   * Permanently delete an article record from the database.
   *
   * @param id - The article UUID.
   * @returns The record as it existed before deletion.
   *
   * @remarks
   * This is a hard delete operation. The service layer must ensure that
   * associated storage (S3) and vector data are also cleaned up.
   */
  async delete(id: string) {
    return this.prisma.knowledgeArticle.delete({
      where: { id },
    });
  }
}