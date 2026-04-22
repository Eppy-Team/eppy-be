import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EmbeddingStatus } from '@prisma/client';
import { KnowledgeRepository } from './knowledge.repository';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';

/**
 * Knowledge Service
 *
 * Business logic layer for knowledge base management.
 * Handles CRUD operations, S3 file uploads, and orchestration with the AI service
 * for automatic embedding/vectorization of articles.
 *
 * Embedding processing is performed asynchronously to ensure non-blocking operations.
 *
 * Dependencies:
 * - KnowledgeRepository: Database operations.
 * - AiService: Embedding generation and management.
 * - StorageService: S3 file storage operations.
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
   * Retrieve a paginated list of knowledge articles.
   *
   * @param page - Page number (1-indexed, defaults to 1).
   * @param limit - Number of items per page (defaults to 10).
   * @returns Articles with pagination metadata (total, page, lastPage, limit).
   */
  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const { articles, total } = await this.knowledgeRepository.findAll({
      skip,
      take: limit,
    });

    return {
      message: 'Articles retrieved',
      data: articles,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }

  /**
   * Retrieve a single knowledge article by its ID with full details.
   *
   * @param id - The article's UUID.
   * @returns A complete article object including author information.
   * @throws {NotFoundException} If the article is not found.
   */
  async findById(id: string) {
    const article = await this.knowledgeRepository.findById(id);
    if (!article) {
      throw new NotFoundException('Knowledge article not found');
    }
    return {
      message: 'Article retrieved',
      data: {
        id: article.id,
        title: article.title,
        content: article.content,
        category: article.category,
        fileUrl: article.fileUrl,
        embeddingStatus: article.embeddingStatus,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
        author: {
          id: article.author.id,
          name: article.author.name,
        },
      },
    };
  }

  /**
   * Create a new knowledge article with a file upload.
   *
   * Flow:
   * 1. Upload PDF file to S3 storage.
   * 2. Create article record in the database with PENDING status.
   * 3. Trigger asynchronous embedding processing.
   *
   * @param dto - CreateKnowledgeDto containing title and category.
   * @param file - Multer file object (PDF).
   * @param userId - The creator's user ID from the JWT token.
   * @returns The created article with an initial embedding status of PENDING.
   *
   * @remarks
   * Embedding processing runs asynchronously without blocking the response.
   * The status will transition to DONE or FAILED based on the processing result.
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

    this.triggerEmbed(
      article.id,
      dto.title,
      dto.category,
      file.buffer,
      file.originalname,
    );

    return {
      message: 'Article created. Processing embeddings.',
      data: article,
    };
  }

  /**
   * Update an existing knowledge article.
   *
   * Only the title and category are updatable.
   * Any update will trigger a re-embedding process with a PENDING status.
   *
   * @param id - The article's UUID.
   * @param dto - UpdateKnowledgeDto containing optional title and/or category.
   * @returns The updated article object.
   * @throws {NotFoundException} If the article is not found.
   *
   * @remarks
   * Embedding processing is triggered asynchronously after the database update.
   */
  async update(id: string, dto: UpdateKnowledgeDto) {
    const existing = await this.knowledgeRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Knowledge article not found');
    }

    const updated = await this.knowledgeRepository.update(id, {
      ...(dto.title && { title: dto.title }),
      ...(dto.category && { category: dto.category }),
    });

    return {
      message: 'Article updated',
      data: updated,
    };
  }

  /**
   * Delete a knowledge article.
   *
   * Flow:
   * 1. Delete the article from the database.
   * 2. Delete the associated file from S3 (async).
   * 3. Delete the associated embedding from the AI service (async).
   *
   * @param id - The article's UUID.
   * @returns A success message.
   * @throws {NotFoundException} If the article is not found.
   *
   * @remarks
   * File and embedding deletions are performed asynchronously to prevent response blocking.
   * Errors in async deletion tasks are logged but do not affect the main response.
   */
  async delete(id: string) {
    const existing = await this.knowledgeRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Knowledge article not found');
    }

    await this.knowledgeRepository.delete(id);

    if (existing.fileKey) {
      this.storageService
        .delete(existing.fileKey)
        .catch((err) =>
          this.logger.error(
            `[delete] gagal hapus file storage ${id}`,
            err?.message,
          ),
        );
    }

    this.aiService
      .deleteEmbed(id)
      .then(() => this.logger.log(`[delete] embedding deleted for ${id}`))
      .catch((err) =>
        this.logger.error(`[delete] gagal hapus embedding ${id}`, err?.message),
      );

    return { message: 'Article deleted' };
  }

  /**
   * Private helper: Trigger the asynchronous embedding process.
   *
   * Orchestrates embedding generation with state management:
   * 1. Update status to PROCESSING.
   * 2. Generate embeddings via the AI service.
   * 3. Set status to DONE on success or FAILED on error.
   *
   * @param articleId - Target article ID for embedding.
   * @param title - Article title (for context).
   * @param category - Article category (for context).
   * @param buffer - File buffer content.
   * @param fileName - Original file name.
   *
   * @remarks
   * Fully asynchronous — errors are logged internally and not re-thrown.
   * Designed specifically for non-blocking background processing.
   */
  private triggerEmbed(
    articleId: string,
    title: string,
    category: string,
    buffer: Buffer,
    fileName: string,
  ) {
    this.knowledgeRepository
      .updateEmbeddingStatus(articleId, EmbeddingStatus.PROCESSING)
      .then(() =>
        this.aiService.embed(articleId, title, category, buffer, fileName),
      )
      .then(() => {
        this.logger.log(`[embed] success for ${articleId}`);
        return this.knowledgeRepository.updateEmbeddingStatus(
          articleId,
          EmbeddingStatus.DONE,
        );
      })
      .catch((err) => {
        this.logger.error(`[embed] failed for ${articleId}`, err?.message);
        this.knowledgeRepository
          .updateEmbeddingStatus(articleId, EmbeddingStatus.FAILED)
          .catch(() => {});
      });
  }
}
