export interface EmbedResponseDto {
  success: boolean;
  article_id: string;
  embedding_dimensions: number;
}

export interface DeleteEmbedResponseDto {
  success: boolean;
  article_id: string;
}

export interface HealthCheckResponseDto {
  status: string;
  model: string;
  knowledge_count: number;
}

export interface AiErrorResponseDto {
  error_code: AiErrorCode;
  message: string;
}

export enum AiErrorCode {
  NO_KNOWLEDGE = 'NO_KNOWLEDGE',
  LLM_RATE_LIMIT = 'LLM_RATE_LIMIT',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  EMBED_FAILED = 'EMBED_FAILED',
  IMAGE_UNREADABLE = 'IMAGE_UNREADABLE',
}