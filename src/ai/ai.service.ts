import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import {
  EmbedResponseDto,
  DeleteEmbedResponseDto,
  HealthCheckResponseDto,
  AiErrorCode,
} from './dto/ai-response.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: AxiosInstance;
  private readonly useMock: boolean;

  constructor(private readonly configService: ConfigService) {
    const baseURL = this.configService.get<string>('AI_SERVICE_URL');
    const timeout = this.configService.get<number>('AI_SERVICE_TIMEOUT_MS');

    this.useMock =
      this.configService.get<string>('AI_SERVICE_MOCK', 'false') === 'true';

    this.client = axios.create({
      baseURL,
      timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    this.logger.log(
      `AiService initialized — baseURL: ${baseURL}, mock: ${this.useMock}`,
    );
  }

  // ─── POST /chat ───────────────────────────────────────────────────────────

  async chat(payload: ChatRequestDto): Promise<ChatResponseDto> {
    if (this.useMock) {
      return this.mockChatResponse();
    }

    try {
      const { data } = await this.client.post<ChatResponseDto>(
        '/chat',
        payload,
      );
      this.logger.log(
        `[chat] conversation_id=${payload.conversation_id} confidence=${data.confidence_score}`,
      );
      return data;
    } catch (error) {
      throw this.handleAiError(error, 'chat');
    }
  }

  // ─── POST /embed ──────────────────────────────────────────────────────────
  // Dipanggil secara async/fire-and-forget dari KnowledgeService.
  // Jangan await di luar kecuali perlu hasilnya.

  async embed(
    articleId: string,
    title: string,
    category: string,
    fileBuffer: Buffer,
    originalFileName: string,
  ): Promise<EmbedResponseDto> {
    if (this.useMock) {
      return this.mockEmbedResponse(articleId);
    }

    const form = new FormData();
    form.append('article_id', articleId);
    form.append('title', title);
    form.append('category', category);
    form.append('file', fileBuffer, {
      filename: originalFileName,
      contentType: 'application/pdf',
    });

    try {
      const { data } = await this.client.post<EmbedResponseDto>(
        '/embed',
        form,
        {
          headers: form.getHeaders(),
          timeout: 60000,
        },
      );
      this.logger.log(`[embed] article_id=${articleId} done`);
      return data;
    } catch (error) {
      const errorMessage =
        error instanceof AxiosError ? error.message : (error as Error).message;

      this.logger.error(`[embed] article_id=${articleId} failed`, errorMessage);
      throw this.handleAiError(error, 'embed');
    }
  }

  // ─── DELETE /embed/:article_id ────────────────────────────────────────────

  async deleteEmbed(articleId: string): Promise<DeleteEmbedResponseDto> {
    if (this.useMock) {
      return { success: true, article_id: articleId };
    }

    try {
      const { data } = await this.client.delete<DeleteEmbedResponseDto>(
        `/embed/${articleId}`,
      );
      this.logger.log(`[deleteEmbed] article_id=${articleId} done`);
      return data;
    } catch (error) {
      const errorMessage =
        error instanceof AxiosError ? error.message : (error as Error).message;

      this.logger.error(`[embed] article_id=${articleId} failed`, errorMessage);
      throw this.handleAiError(error, 'embed');
    }
  }

  // ─── GET /health ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<HealthCheckResponseDto> {
    if (this.useMock) {
      return { status: 'ok', model: 'mock', knowledge_count: 0 };
    }

    try {
      const { data } = await this.client.get<HealthCheckResponseDto>('/health');
      return data;
    } catch (error) {
      this.logger.error('[healthCheck] AI Service tidak bisa dihubungi');
      throw new ServiceUnavailableException('AI Service tidak tersedia');
    }
  }

  // ─── Error Handler ────────────────────────────────────────────────────────

  private handleAiError(error: unknown, context: string): HttpException {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{
        error_code: string;
        message: string;
      }>;

      // AI Service merespons dengan error terstruktur
      if (axiosError.response) {
        const { status, data } = axiosError.response;
        const errorCode = data?.error_code;
        const message = data?.message ?? 'Terjadi kesalahan pada AI Service';

        this.logger.warn(`[${context}] AI error: ${errorCode} — ${message}`);

        switch (errorCode) {
          case AiErrorCode.NO_KNOWLEDGE:
            return new HttpException(
              { error_code: errorCode, message },
              HttpStatus.UNPROCESSABLE_ENTITY,
            );

          case AiErrorCode.LLM_RATE_LIMIT:
          case AiErrorCode.LLM_TIMEOUT:
            return new ServiceUnavailableException(
              'Sistem AI sedang sibuk, coba beberapa saat lagi',
            );

          case AiErrorCode.IMAGE_UNREADABLE:
            return new BadRequestException(
              'Gambar tidak dapat diproses. Pastikan format dan kualitas gambar valid.',
            );

          case AiErrorCode.EMBED_FAILED:
            return new HttpException(
              'Proses embedding dokumen gagal',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );

          default:
            return new HttpException(message, status);
        }
      }

      // AI Service tidak merespons sama sekali (timeout / down)
      if (
        axiosError.code === 'ECONNABORTED' ||
        axiosError.code === 'ECONNREFUSED'
      ) {
        this.logger.error(`[${context}] AI Service tidak bisa dihubungi`);
        return new ServiceUnavailableException(
          'AI Service sedang tidak tersedia. Silakan coba lagi atau hubungi admin.',
        );
      }
    }

    this.logger.error(`[${context}] Unexpected error`, error);
    return new HttpException(
      'Terjadi kesalahan tidak terduga',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  // ─── Mock Responses ───────────────────────────────────────────────────────
  // Dipakai saat AI_SERVICE_MOCK=true di .env (development/testing)

  private mockChatResponse(): ChatResponseDto {
    this.logger.debug('[chat] returning mock response');
    return {
      answer:
        '[MOCK] Maaf, sistem AI sedang dalam mode pengembangan. Silakan hubungi admin.',
      confidence_score: 0.0,
      sources: [],
    };
  }

  private mockEmbedResponse(articleId: string): EmbedResponseDto {
    this.logger.debug(`[embed] returning mock response for ${articleId}`);
    return {
      success: true,
      article_id: articleId,
      embedding_dimensions: 1536,
    };
  }
}
