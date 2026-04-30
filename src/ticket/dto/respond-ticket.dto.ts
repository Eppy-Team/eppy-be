import { IsString, IsNotEmpty } from 'class-validator';

export class RespondTicketDto {
  @IsString()
  @IsNotEmpty()
  adminResponse!: string;
}