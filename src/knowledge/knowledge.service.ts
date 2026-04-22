import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EmbeddingStatus } from '@prisma/client';
import { KnowledgeRepository } from './knowledge.repository';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly aiService: AiService,
    private readonly storageService: StorageService,
  ) {}

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

  async update(id: string, dto: UpdateKnowledgeDto) {
    const existing = await this.knowledgeRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Knowledge article not found');
    }

    const updated = await this.knowledgeRepository.update(id, {
      ...(dto.title && { title: dto.title }),
      ...(dto.category && { category: dto.category })
    });

    return {
      message: 'Article updated',
      data: updated,
    };
  }

  async delete(id: string) {
    const existing = await this.knowledgeRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Knowledge article not found');
    }

    await this.knowledgeRepository.delete(id);

    // Hapus file dari storage — async
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

    // Hapus embedding di AI Service — async
    this.aiService
      .deleteEmbed(id)
      .then(() => this.logger.log(`[delete] embedding deleted for ${id}`))
      .catch((err) =>
        this.logger.error(`[delete] gagal hapus embedding ${id}`, err?.message),
      );

    return { message: 'Article deleted' };
  }

  // ─── Private Helper ───────────────────────────────────────────────────────

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
