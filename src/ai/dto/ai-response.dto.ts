/**
 * Embed Response DTO
 *
 * Response from AI service after successful PDF embedding generation.
 * Confirms that embeddings have been created and stored in vector database.
 *
 * @property success - Operation success status
 * @property article_id - Article identifier (UUID)
 * @property embedding_dimensions - Vector dimension count (typically 1536 for Ada model)
 */
export interface EmbedResponseDto {
  success: boolean;
  article_id: string;
  embedding_dimensions: number;
}

/**
 * Delete Embed Response DTO
 *
 * Response from AI service after successful embedding deletion.
 * Confirms that article's vectors have been removed from vector database.
 *
 * @property success - Operation success status
 * @property article_id - Article identifier (UUID) that was deleted
 */
export interface DeleteEmbedResponseDto {
  success: boolean;
  article_id: string;
}

/**
 * Health Check Response DTO
 *
 * Response from AI service health check endpoint.
 * Provides service status and knowledge base metrics.
 *
 * @property status - Service operational status (e.g., 'ok', 'degraded')
 * @property model - Active embedding/LLM model name
 * @property knowledge_count - Total number of embedded articles in vector database
 */
export interface HealthCheckResponseDto {
  status: string;
  model: string;
  knowledge_count: number;
}

/**
 * AI Error Response DTO
 *
 * Structured error response from AI service.
 * Provides error classification for client-side error handling.
 *
 * @property error_code - Specific error code for programmatic handling
 * @property message - Human-readable error description
 */
export interface AiErrorResponseDto {
  error_code: AiErrorCode;
  message: string;
}

/**
 * AI Error Code Enumeration
 *
 * Standardized error codes returned by AI service.
 * Used for consistent error handling and status code mapping.
 *
 * @enum
 * - NO_KNOWLEDGE: No relevant articles found in knowledge base for query
 * - LLM_RATE_LIMIT: AI service rate limiting (too many requests)
 * - LLM_TIMEOUT: LLM inference timeout (model too slow)
 * - EMBED_FAILED: PDF embedding generation failed
 * - IMAGE_UNREADABLE: Image attachment could not be processed
 */
export enum AiErrorCode {
  NO_KNOWLEDGE = 'NO_KNOWLEDGE',
  LLM_RATE_LIMIT = 'LLM_RATE_LIMIT',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  EMBED_FAILED = 'EMBED_FAILED',
  IMAGE_UNREADABLE = 'IMAGE_UNREADABLE',
}