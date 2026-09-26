import { Authenticated, Public } from '../authz/decorators';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

/** Brute-force protection: limited attempts per IP and per minute (AUTH_RATE_LIMIT, default 10). */
const authLimit = { default: { limit: () => Number(process.env.AUTH_RATE_LIMIT) || 10, ttl: 60_000 } };

class MfaVerifyDto {
  @IsString()
  mfaToken!: string;

  @Matches(/^\d{6}$/)
  code!: string;
}

class MfaCodeDto {
  @Matches(/^\d{6}$/)
  code!: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  @Length(20, 200)
  token!: string;

  @IsString()
  @MinLength(10, { message: 'Le mot de passe doit contenir au moins 10 caractères' })
  password!: string;
}

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(authLimit)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion (email + mot de passe). Renvoie mfaRequired si la double authentification est active.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @Throttle(authLimit)
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  verifyMfa(@Body() dto: MfaVerifyDto) {
    return this.authService.verifyMfa(dto.mfaToken, dto.code);
  }

  @Authenticated()
  @Post('mfa/setup')
  setupMfa(@CurrentUser() user: AuthUser) {
    return this.authService.setupMfa(user.userId);
  }

  @Authenticated()
  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  enableMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.authService.enableMfa(user.userId, dto.code);
  }

  @Public()
  @Throttle(authLimit)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(authLimit)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
