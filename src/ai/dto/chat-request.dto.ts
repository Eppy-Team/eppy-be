export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequestDto {
  conversation_id: string;
  content: string;
  image_url: string | null;
  history: ChatHistoryItem[];
}