import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EmbeddingStatus } from '@prisma/client';
import { KnowledgeRepository } from './knowledge.repository';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';

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
   * Fetch complete details for a specific article.
   * * @param id - Article UUID.
   * @returns Detailed article object with author metadata.
   * @throws {NotFoundException} If the article does not exist.
   */
  async findById(id: string) {
    const article = await this.knowledgeRepository.findById(id);
    if (!article) {
      throw new NotFoundException('Knowledge article not found');
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
    const { url: fileUrl, key: fileKey } = await this.storageService.upload(file);

    const article = await this.knowledgeRepository.create({
      title: dto.title,
      category: dto.category,
      fileUrl,
      fileKey,
      createdBy: userId,
    });

    // Fire-and-forget background task
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
   * Update metadata for an existing knowledge article.
   * * @param id - Target article UUID.
   * @param dto - Partial update payload.
   * @throws {NotFoundException} If the article is not found.
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
   * Remove an article and its associated cloud/AI resources.
   * * Lifecycle Cleanup:
   * 1. Synchronous database record deletion.
   * 2. Asynchronous S3 file cleanup.
   * 3. Asynchronous AI vector deletion.
   * * @param id - Target article UUID.
   * @throws {NotFoundException} If the article is not found.
   */
  async delete(id: string) {
    const existing = await this.knowledgeRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Knowledge article not found');
    }

    await this.knowledgeRepository.delete(id);

    // Asynchronous cleanup tasks with error logging
    if (existing.fileKey) {
      this.storageService
        .delete(existing.fileKey)
        .catch((err) =>
          this.logger.error(`[delete] S3 cleanup failed for ${id}`, err?.message),
        );
    }

    this.aiService
      .deleteEmbed(id)
      .then(() => this.logger.log(`[delete] Vector embedding deleted for ${id}`))
      .catch((err) =>
        this.logger.error(`[delete] Vector cleanup failed for ${id}`, err?.message),
      );

    return { message: 'Article deleted' };
  }

  /**
   * Private: Triggers the background AI embedding lifecycle.
   * * State Management Flow:
   * - Sets status to 'PROCESSING'.
   * - Performs vectorization via AiService.
   * - Updates status to 'DONE' on success or 'FAILED' on error.
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
        this.logger.log(`[embed] successfully vectorized ${articleId}`);
        return this.knowledgeRepository.updateEmbeddingStatus(
          articleId,
          EmbeddingStatus.DONE,
        );
      })
      .catch((err) => {
        this.logger.error(`[embed] background processing failed for ${articleId}`, err?.message);
        this.knowledgeRepository
          .updateEmbeddingStatus(articleId, EmbeddingStatus.FAILED)
          .catch(() => {});
      });
  }
}