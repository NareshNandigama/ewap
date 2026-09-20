import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class AskAiDto {
  @IsString()
  @MinLength(3)
  question!: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  conversationId?: string;
}