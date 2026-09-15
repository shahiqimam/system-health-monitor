import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@pulsewatch.local' })
  @IsEmail()
  @Length(3, 255)
  email!: string;

  @ApiProperty({ example: 'AdminPass123!' })
  @IsString()
  @Length(8, 200)
  password!: string;
}
