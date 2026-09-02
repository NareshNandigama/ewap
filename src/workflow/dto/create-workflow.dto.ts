import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 100)
  name: string;
}