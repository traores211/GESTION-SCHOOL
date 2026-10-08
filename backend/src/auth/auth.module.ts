import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { jwtSecret } from './jwt-secret';
import { LoginRateLimiter } from './login-rate-limiter';
import { ACCESS_TTL, TokenService } from './token.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: ACCESS_TTL as never },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LoginRateLimiter, TokenService],
  exports: [TokenService, LoginRateLimiter],
})
export class AuthModule {}
