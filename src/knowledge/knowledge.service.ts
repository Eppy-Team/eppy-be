import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EmbeddingStatus } from '@prisma/client';
import { KnowledgeRepository } from './knowledge.repository';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';

/**
 * Knowledge Service
 * * Central business logic orchestrator for the system's knowledge base.
 * Manages the full lifecycle of articles, including database persistence,
 * cloud storage (S3) integration, and background AI embedding processes.
 *
 * Dependencies:
 * - KnowledgeRepository: Data access and state persistence.
 * - AiService: Vectorization and embedding generation.
 * - StorageService: File upload and deletion operations.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly aiService: AiService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Retrieve a paginated collection of knowledge articles.
   * * @param page - Current page number (default: 1).
   * @param limit - Number of records per page (default: 10).
   * @returns Paginated data with standardized metadata.
   */
  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const { articles, total } = await this.knowledgeRepository.findAll({
      skip,
      take: limit,
    });

    // Re-generate signed URL
    const articlesWithFreshUrls = await Promise.all(
      articles.map(async (article) => {
        if (article.fileKey) {
          const freshUrl = await this.storageService.generateSignedUrl(
            article.fileKey,
          );
          return { ...article, fileUrl: freshUrl };
        }
        return article;
      }),
    );

    return {
      message: 'Articles retrieved',
      data: articlesWithFreshUrls,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }

  /**
   * Fetch complete details for a specific article.
   * * @param id - Article UUID.
   * @returns Detailed article object with author metadata.
   * @throws {NotFoundException} If the article does not exist.
   */
  async findById(id: string) {
    const article = await this.knowledgeRepository.findById(id);
    if (!article) throw new NotFoundException('Knowledge article not found');

    // Re-generate signed URL
    if (article.fileKey) {
      const freshUrl = await this.storageService.generateSignedUrl(
        article.fileKey,
      );
      return {
        message: 'Article retrieved',
        data: { ...article, fileUrl: freshUrl },
      };
    }

    return {
      message: 'Article retrieved',
      data: article,
    };
  }

  /**
   * Initialize a new knowledge article with file processing.
   * * Orchestration Flow:
   * 1. Persist the file to S3 storage.
   * 2. Create a database record with 'PENDING' status.
   * 3. Trigger asynchronous background embedding.
   * * @param dto - Article metadata (title, category).
   * @param file - Multipart PDF file.
   * @param userId - ID of the admin performing the operation.
   * @returns The newly created article record.
   */
  async create(
    dto: CreateKnowledgeDto,
    file: Express.Multer.File,
    userId: string,
  ) {
    const { url: fileUrl, key: fileKey } =
      await this.storageService.upload(file);

    const article = await this.knowledgeRepository.create({
      title: dto.title,
      category: dto.category,
      fileUrl,
      fileKey,
      createdBy: userId,
    });

    // Fire-and-forget background task
    this.triggerEmbed(article.id, dto.title, fileUrl, fileKey);

    return {
      message: 'Article created. Processing embeddings.',
      data: article,
    };
  }

  /**
   * Remove an article and its associated cloud/AI resources.
   *
   * Execution Flow:
   * 1. Verify article exists in database.
   * 2. Delete article record from database (synchronous).
   * 3. Trigger background cleanup of S3 file and vector embeddings (asynchronous).
   *
   * @param id - Target article UUID.
   * @returns Success confirmation message.
   * @throws {NotFoundException} If the article is not found.
   *
   * @remarks
   * Resource cleanup runs in the background and does not block the response.
   * Orphaned resources are logged for manual cleanup if operations fail.
   */
  async delete(id: string) {
    const existing = await this.knowledgeRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Knowledge article not found');
    }

    await this.knowledgeRepository.delete(id);

    this.cleanupResources(id, existing.fileKey);

    return { message: 'Article deleted' };
  }

  /**
   * Private: Triggers the background AI embedding lifecycle with automatic cleanup.
   *
   * Orchestration Flow:
   * 1. Updates article status to 'PROCESSING'.
   * 2. Sends PDF S3 URL to AI service for vectorization.
   * 3. Updates status to 'DONE' on success or 'FAILED' on error.
   * 4. Cleans up S3 file if embedding fails or AI returns success=false.
   *
   * @param articleId - Article UUID being embedded.
   * @param title - Article title for embedding context.
   * @param s3Url - Public S3 URL of the PDF file for AI service to process.
   * @param fileKey - S3 file key for cleanup operations if embedding fails.
   */
  private triggerEmbed(
    articleId: string,
    title: string,
    s3Url: string,
    fileKey: string,
  ) {
    this.knowledgeRepository
      .updateEmbeddingStatus(articleId, EmbeddingStatus.PROCESSING)
      .then(() => this.aiService.embed(articleId, title, s3Url))
      .then((result) => {
        if (result.success) {
          this.logger.log(`[embed] success for ${articleId}`);
          return this.knowledgeRepository.updateEmbeddingStatus(
            articleId,
            EmbeddingStatus.DONE,
          );
        } else {
          this.logger.warn(
            `[embed] AI returned success=false for ${articleId}`,
          );

          this.storageService
            .delete(fileKey)
            .catch((err) =>
              this.logger.error(
                `[embed] gagal hapus S3 file ${articleId}`,
                err?.message,
              ),
            );

          return this.knowledgeRepository.updateEmbeddingStatus(
            articleId,
            EmbeddingStatus.FAILED,
          );
        }
      })
      .catch((err) => {
        this.logger.error(`[embed] failed for ${articleId}`, err?.message);

        this.storageService
          .delete(fileKey)
          .then(() =>
            this.logger.log(`[embed] S3 file cleaned up for ${articleId}`),
          )
          .catch((deleteErr) =>
            this.logger.error(
              `[embed] gagal hapus S3 file ${articleId}`,
              deleteErr?.message,
            ),
          );

        this.knowledgeRepository
          .updateEmbeddingStatus(articleId, EmbeddingStatus.FAILED)
          .catch(() => {});
      });
  }

  /**
   * Private: Cleans up cloud storage and vector database resources for a deleted article.
   *
   * Executes parallel deletion tasks with fault-tolerant error handling.
   * If either operation fails, logs the orphaned resource for manual cleanup.
   *
   * Cleanup Workflow:
   * 1. Delete PDF file from S3 storage (if fileKey exists).
   * 2. Delete vector embeddings from AI database (parallel execution).
   * 3. Log results: successful cleanup, orphaned S3 file, or orphaned vectors.
   *
   * @param articleId - Article UUID for logging and vector cleanup.
   * @param fileKey - S3 file key for storage deletion. Can be null if no file was stored.
   *
   * @remarks
   * Uses Promise.allSettled for parallel execution to ensure both cleanup operations
   * are attempted even if one fails. Failures are logged but do not throw exceptions,
   * allowing the delete operation to complete successfully while flagging orphaned resources.
   */
  private async cleanupResources(articleId: string, fileKey: string | null) {
    const results = await Promise.allSettled([
      fileKey ? this.storageService.delete(fileKey) : Promise.resolve(),
      this.aiService.deleteEmbed(articleId),
    ]);

    const [storageResult, aiResult] = results;

    if (storageResult.status === 'rejected') {
      this.logger.error(
        `[cleanup] ORPHANED S3 FILE — manual cleanup needed. fileKey: ${fileKey}`,
        storageResult.reason?.message,
      );
    }

    if (aiResult.status === 'rejected') {
      this.logger.error(
        `[cleanup] ORPHANED VECTOR — manual cleanup needed for articleId: ${articleId}`,
        aiResult.reason?.message,
      );
    }

    if (
      storageResult.status === 'fulfilled' &&
      aiResult.status === 'fulfilled'
    ) {
      this.logger.log(`[cleanup] All resources cleaned up for ${articleId}`);
    }
  }
}
