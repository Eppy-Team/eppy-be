import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Create Knowledge Article DTO
 * * Defines the contract for creating a new knowledge article.
 * Validates the metadata before the file is processed and stored.
 */
export class CreateKnowledgeDto {
  /**
   * The descriptive title of the knowledge article.
   * @example "Introduction to RAG Systems"
   * @constraints Required, Non-empty string.
   */
  @IsString()
  @IsNotEmpty()
  title!: string;

  /**
   * The classification category for the article.
   * Used for grouping and organizing knowledge base content.
   * @example "Architecture"
   * @constraints Required, Non-empty string.
   */
  @IsString()
  @IsNotEmpty()
  category!: string;
}