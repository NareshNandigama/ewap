import { Transform } from 'class-transformer';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { CreateUserDto } from '../../user/dto/create-user.dto.js';

export class RegisterDto extends CreateUserDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  organizationName: string;
}
