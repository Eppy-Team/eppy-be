import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, EmbeddingStatus } from '@prisma/client';

/**
 * Knowledge Repository
 *
 * Data Access Layer for the knowledge base (`knowledge_article` table).
 * Manages CRUD operations, pagination, and embedding status lifecycle for document management.
 *
 * Responsibilities:
 * - Paginated article retrieval with total count aggregation.
 * - Article creation with initial state management (`embeddingStatus: PENDING`).
 * - Embedding status transitions for background vector processing pipeline.
 * - Hard deletion with associated metadata cleanup markers.
 *
 * Dependencies:
 * - PrismaService: Database client for Prisma ORM operations.
 *
 * @remarks
 * Embedding Lifecycle: PENDING → PROCESSING → DONE (or FAILED).
 * File References: Articles store S3 keys for cleanup during deletion.
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
          fileKey: true,
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
   * Persist a new knowledge article record with initial embedding state.
   *
   * @param data - Payload: title, category, fileUrl, fileKey (S3), createdBy (admin user ID).
   * @returns Created article with id, title, category, fileUrl, embeddingStatus, createdAt.
   *
   * @remarks
   * Initial State: `embeddingStatus` defaults to `PENDING` (queued for vector embedding).
   * Audit Trail: `createdBy` field stores the authenticated admin user's ID for accountability.
   * File Reference: `fileKey` is stored for S3 cleanup during article deletion.
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