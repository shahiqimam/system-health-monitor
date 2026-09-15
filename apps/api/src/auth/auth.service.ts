import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, JwtPayload } from '../common/types';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    // Same message for unknown email and wrong password: no user enumeration.
    if (!user || !(await this.usersService.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
  }
}
