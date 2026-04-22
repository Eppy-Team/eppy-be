import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
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

  async findAll() {
    const articles = await this.knowledgeRepository.findAll();
    return {
      message: 'Knowledge articles retrieved successfully',
      data: articles,
    };
  }

  async findById(id: string) {
    const article = await this.knowledgeRepository.findById(id);
    if (!article) {
      throw new NotFoundException('Knowledge article not found');
    }
    return {
      message: 'Knowledge article retrieved successfully',
      data: article,
    };
  }

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

    this.triggerEmbed(article.id, dto.title, dto.category, file.buffer, file.originalname);

    return {
      message: 'Knowledge article created. Embedding sedang diproses.',
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
      ...(dto.category && { category: dto.category }),
      embeddingStatus: EmbeddingStatus.PENDING,
    });

    return {
      message: 'Knowledge article updated successfully.',
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
          this.logger.error(`[delete] gagal hapus file storage ${id}`, err?.message),
        );
    }

    // Hapus embedding di AI Service — async
    this.aiService
      .deleteEmbed(id)
      .then(() => this.logger.log(`[delete] embedding deleted for ${id}`))
      .catch((err) =>
        this.logger.error(`[delete] gagal hapus embedding ${id}`, err?.message),
      );

    return { message: 'Knowledge article deleted successfully' };
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
      .then(() => this.aiService.embed(articleId, title, category, buffer, fileName))
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