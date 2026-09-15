import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfig } from '../config/configuration';
import { AuthUser, JwtPayload } from '../common/types';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<AppConfig, true>,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwtSecret', { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Re-read the user so a revoked/role-changed account cannot keep acting on
    // a still-valid token for the rest of its lifetime.
    const user = await this.usersService.findByEmail(payload.email).catch(() => null);
    if (!user || user.id !== payload.sub) {
      throw new UnauthorizedException('Invalid session');
    }
    return { id: user.id, email: user.email, role: user.role, name: user.name };
  }
}
