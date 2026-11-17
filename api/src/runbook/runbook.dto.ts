import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PutRunbookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  source?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  content!: string;

  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number;
}
