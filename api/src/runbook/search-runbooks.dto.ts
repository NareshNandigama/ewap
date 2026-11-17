import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class SearchRunbooksDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  query!: string;

  @IsOptional()
  @IsIn(['keyword', 'vector', 'hybrid'])
  mode?: 'keyword' | 'vector' | 'hybrid';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
