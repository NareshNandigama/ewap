import {
  IsOptional,
  IsIn,
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

export class DiagnoseWorkflowDto extends AskAiDto {
  @IsOptional()
  @IsIn(['keyword', 'vector', 'hybrid'])
  retrievalMode?: 'keyword' | 'vector' | 'hybrid';

  @IsOptional()
  @IsIn(['python', 'gemini'])
  groundingProvider?: 'python' | 'gemini';
}
