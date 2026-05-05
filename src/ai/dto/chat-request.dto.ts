/**
 * Chat History Item
 *
 * Single message in conversation history.
 * Used for context continuity in multi-turn conversations.
 *
 * @property role - Message sender role ('user' or 'assistant')
 * @property content - Message text content
 */
export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Chat Request DTO
 *
 * Request payload for retrieval-augmented generation (RAG) chat endpoint.
 * Contains user query, conversation context, and optional image attachment.
 *
 * @property conversation_id - Unique conversation identifier (UUID).
 * @property query - User message text for semantic search and LLM processing.
 * @property image_url - Optional image URL for multimodal analysis (null if no image).
 * @property history - Previous messages in conversation for context window.
 *
 * @remarks
 * Image URL is optional for multimodal queries or document analysis.
 * History should include recent messages (typically last 5-10) for efficient context window usage.
 */
export interface ChatRequestDto {
  conversation_id: string;
  query: string;
  image_url: string | null;
  history: ChatHistoryItem[];
}