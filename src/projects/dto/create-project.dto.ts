import { IsOptional, IsString, Length } from "class-validator";

export class CreateProjectDto {
    @IsString()
    @Length(3, 100)
    name: string;

    @IsString()
    @Length(0, 500)
    @IsOptional()
    description?: string;
}
