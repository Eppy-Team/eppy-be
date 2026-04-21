export interface ChatSource {
  article_id: string;
  title: string;
  snippet: string;
}

export interface ChatResponseDto {
  answer: string;
  confidence_score: number;
  sources: ChatSource[];
}