import { IsString, IsOptional } from 'class-validator';

/**
 * Update Knowledge Article DTO
 *
 * Data Transfer Object for handling knowledge article update requests.
 * All fields are optional, allowing for partial updates to the title, category, or both.
 *
 * @property title - The updated article title (optional).
 * @property category - The updated article category (optional).
 *
 * @remarks
 * At least one field must be provided to perform a meaningful update.
 * Validation is enforced via class-validator decorators.
 */
export class UpdateKnowledgeDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  category?: string;
}
