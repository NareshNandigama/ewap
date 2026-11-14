import {
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';

export class AskAiDto {
  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  question!: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  conversationId?: string;

  @IsUUID()
  workflowRunId!: string;
}
