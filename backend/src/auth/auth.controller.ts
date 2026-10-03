import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, ClientMeta } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto, TotpCodeDto, TotpDisableDto } from './dto/login.dto';
import { REFRESH_COOKIE, REFRESH_TTL_DAYS } from './token.service';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { MANAGEMENT } from '../common/roles';

/** The refresh token never reaches JavaScript: HttpOnly cookie limited to the auth routes. */
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: (process.env.COOKIE_SAMESITE as CookieOptions['sameSite']) || 'lax',
    path: '/api/auth',
    maxAge: REFRESH_TTL_DAYS * 86400000,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

function meta(req: Request): ClientMeta {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in: short access token in the body, rotating refresh token in an HttpOnly cookie' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refresh, ...result } = await this.authService.login(dto.email, dto.password, dto.totp, meta(req));
    res.cookie(REFRESH_COOKIE, refresh.token, cookieOptions());
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'New access token from the refresh cookie (the cookie is rotated)' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const { refresh, ...result } = await this.authService.refresh(req.cookies?.[REFRESH_COOKIE], meta(req));
      res.cookie(REFRESH_COOKIE, refresh.token, cookieOptions());
      return result;
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    return { success: true };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgot(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto.email, meta(req));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  reset(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  // ---------- signed-in account

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.userId);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    return result;
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeAll(user.userId);
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    return { success: true };
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  totpSetup(@CurrentUser() user: AuthUser) {
    return this.authService.totpSetup(user.userId);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  totpEnable(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto) {
    return this.authService.totpEnable(user.userId, dto.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  totpDisable(@CurrentUser() user: AuthUser, @Body() dto: TotpDisableDto) {
    return this.authService.totpDisable(user.userId, dto.password, dto.code);
  }

  @Post('users/:id/revoke-sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MANAGEMENT)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  revokeSessions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.authService.revokeSessionsOf(user, id);
  }
}
