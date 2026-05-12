import { IsEnum, IsNotEmpty } from 'class-validator';
import { MessageFeedback } from '@prisma/client';

export class SubmitFeedbackDto {
  @IsEnum(MessageFeedback)
  @IsNotEmpty()
  feedback!: MessageFeedback;
}