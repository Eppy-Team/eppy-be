import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';

export class CreateTicketDto {
  @IsUUID()
  @IsNotEmpty()
  conversationId!: string;

  @IsUUID()
  @IsNotEmpty()
  messageId!: string; 

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;
}