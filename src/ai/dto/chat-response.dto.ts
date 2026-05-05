/**
 * Chat Source
 *
 * Reference to a knowledge base article used in generating chat response.
 * Provides transparency and traceability of the sources that influenced the answer.
 *
 * @property article_id - Reference to source article (UUID).
 * @property chunks_id - Document chunk identifier within the article.
 * @property title - Article title for client display.
 * @property header - Section header or context within the article.
 * @property snippet - Relevant text excerpt from article that was matched in RAG.
 */
export interface ChatSource {
  article_id: string;
  chunks_id: string;
  title: string;
  header: string;
  snippet: string;
}

/**
 * Chat Response DTO
 *
 * Response payload from RAG chat endpoint.
 * Contains AI-generated answer, confidence metric, source citations, and image analysis results.
 *
 * @property answer - Generated response text from LLM based on query and context.
 * @property confidence_score - Confidence level of answer (0.0 = low, 1.0 = high).
 *   Based on semantic similarity match and model confidence in retrieved context.
 * @property sources - Array of knowledge articles used as context for answer generation.
 * @property image_analyses - Array of analysis results if image was provided with the query.
 *
 * @remarks
 * Confidence score guides UI display; low score may show disclaimer or uncertainty indicator.
 * Empty sources indicate no relevant articles were found (model used generic knowledge).
 * Sources provide transparency and allow users to verify answer provenance and accuracy.
 * Image analyses only populated when image_url was provided in the request.
 */
export interface ChatResponseDto {
  answer: string;
  confidence_score: number;
  sources: ChatSource[];
  image_analyses: string[];
}