import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, Length, MinLength } from 'class-validator';
import { UserRole } from '../../common/enums';

export class CreateUserDto {
  @ApiProperty({ example: 'Dana Ops' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ example: 'dana@example.com' })
  @IsEmail()
  @Length(3, 255)
  email!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  password!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}
