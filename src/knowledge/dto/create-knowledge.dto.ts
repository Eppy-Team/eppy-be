import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Create Knowledge Article DTO
 *
 * Data Transfer Object for creating a new knowledge article request.
 *
 * @property title - The article title (required, non-empty string).
 * @property category - The article category (required, non-empty string).
 *
 * @remarks
 * File upload is handled via multipart/form-data with the field name 'file'.
 * Validation is enforced via class-validator decorators.
 */
export class CreateKnowledgeDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;
}