/**
 * Chat Source
 *
 * Reference to a knowledge base article used in generating chat response.
 * Provides transparency about which articles influenced the answer.
 *
 * @property article_id - Reference to source article (UUID)
 * @property title - Article title for client display
 * @property snippet - Relevant text excerpt from article
 */
export interface ChatSource {
  article_id: string;
  title: string;
  snippet: string;
}

/**
 * Chat Response DTO
 *
 * Response payload from RAG chat endpoint.
 * Contains AI-generated answer, confidence metric, and source citations.
 *
 * @property answer - Generated response text from LLM
 * @property confidence_score - Confidence level of answer (0.0 = low, 1.0 = high)
 *   Based on semantic similarity and model confidence in retrieved context
 * @property sources - Array of knowledge articles used as context
 *
 * @remarks
 * Confidence score guides UI display (low score may show disclaimer).
 * Empty sources indicate no relevant articles were found (generic response).
 * Sources provide transparency and allow users to verify answer provenance.
 */
export interface ChatResponseDto {
  answer: string;
  confidence_score: number;
  sources: ChatSource[];
}