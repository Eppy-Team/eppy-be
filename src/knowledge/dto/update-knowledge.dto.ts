import { IsString, IsOptional } from 'class-validator';

export class UpdateKnowledgeDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  category?: string;
}