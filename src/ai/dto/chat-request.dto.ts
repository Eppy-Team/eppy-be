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
 * @property conversation_id - Unique conversation identifier (UUID)
 * @property content - User message text
 * @property image_url - Optional image URL for multimodal analysis
 * @property history - Previous messages in conversation for context
 *
 * @remarks
 * Image URL optional for image-based queries or document analysis.
 * History should include recent messages (typically last 5-10) for context window efficiency.
 */
export interface ChatRequestDto {
  conversation_id: string;
  content: string;
  image_url: string | null;
  history: ChatHistoryItem[];
}