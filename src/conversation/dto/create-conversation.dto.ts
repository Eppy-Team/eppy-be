import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;
}