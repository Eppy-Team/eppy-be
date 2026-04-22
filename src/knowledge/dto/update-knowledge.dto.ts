import { IsString, IsOptional } from 'class-validator';

/**
 * Update Knowledge Article DTO
 * * Handles partial updates for an existing knowledge article.
 * Allows modification of metadata without re-uploading the original file.
 */
export class UpdateKnowledgeDto {
  /**
   * The new title for the article.
   * @example "Advanced RAG Architectures"
   * @constraints Optional, String.
   */
  @IsString()
  @IsOptional()
  title?: string;

  /**
   * The updated category for the article.
   * @example "Machine Learning"
   * @constraints Optional, String.
   */
  @IsString()
  @IsOptional()
  category?: string;
}