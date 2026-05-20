import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/get-user.decorator';

/**
 * Authentication Controller
 *
 * Exposes REST API endpoints for identity and credential management.
 * Orchestrates user onboarding, authentication sessions, password recovery, and profile retrieval.
 *
 * Endpoints:
 * - POST /auth/register - User account creation.
 * - POST /auth/login - Credential verification and JWT issuance.
 * - GET /auth/me - Current user profile retrieval (requires JWT).
 * - POST /auth/forgot-password - Initiate password reset flow.
 * - POST /auth/reset-password - Complete password reset with token.
 *
 * Security:
 * - Bearer Token: Protected endpoints require valid JWT in Authorization header.
 * - Input Validation: All payloads validated via class-validator DTOs.
 * - Generic Responses: Password endpoints return same response regardless of email validity (enumeration prevention).
 * - HTTPS Required: All endpoints should only be accessible via HTTPS in production.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user account.
   *
   * Validates email uniqueness, hashes password with bcrypt, and persists user entity.
   *
   * @param dto - Registration payload (name, email, plain-text password).
   * @returns User profile object with created account details.
   * @status 201 Created
   *
   * @throws {ConflictException} If email is already registered.
   *
   * @remarks
   * Security:
   * - Password is hashed with bcrypt (cost factor 10) before storage.
   * - Email uniqueness checked at repository level.
   * - Response excludes sensitive fields (passwordHash).
   */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Authenticate user credentials and issue access token.
   *
   * Verifies email and password, then returns JWT access token for authenticated session.
   *
   * @param dto - Login credentials (email, password).
   * @returns Authentication response with JWT accessToken and user metadata.
   * @status 200 OK
   *
   * @throws {UnauthorizedException} If credentials do not match any record.
   *
   * @remarks
   * Security:
   * - Password comparison uses bcrypt timing-safe comparison.
   * - Generic error messages prevent email enumeration attacks.
   * - Clients must include returned accessToken in Authorization header as 'Bearer <token>' for protected requests.
   * - Token expiry defined in JWT configuration (default: 1 day).
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * Retrieve current authenticated user's profile.
   *
   * Fetches user profile data from the validated JWT context (sub claim).
   *
   * @param userId - User UUID extracted from JWT payload.
   * @returns Current user data (sanitized, excludes passwordHash).
   * @status 200 OK
   *
   * @security JWT Bearer Authentication required.
   *
   * @remarks
   * - Requires valid JWT token in Authorization header.
   * - User ID is extracted automatically from JWT by @CurrentUser decorator.
   * - Response is sanitized to exclude sensitive fields.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser('id') userId: string) {
    return this.authService.me(userId);
  }

  /**
   * Initiate password reset flow for forgotten account password.
   *
   * Validates email, generates a secure reset token, and delivers it via email.
   * Returns a generic success message to prevent account enumeration attacks.
   *
   * @param dto - Email address for password reset request.
   * @returns Generic success response (consistent whether email exists or not).
   * @status 200 OK
   *
   * @remarks
   * Flow:
   * [STEP 1] Validate email format via DTO.
   * [STEP 2] Check if email is registered (non-blocking if not found).
   * [STEP 3] Generate cryptographically secure reset token (32 bytes).
   * [STEP 4] Hash token and store in database with 15-minute expiry.
   * [STEP 5] Send reset email with frontend reset link.
   * [STEP 6] Return generic "success" message.
   *
   * Security:
   * - Token is hashed before storage (never stored in plain text).
   * - Generic response prevents email enumeration.
   * - Token is single-use (deleted after successful reset or expiry).
   * - Email failure is non-blocking (logged but doesn't throw).
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * Complete password reset using valid reset token.
   *
   * Validates reset token authenticity and expiry, then updates user password.
   * Requires the raw reset token from email link and the new desired password.
   *
   * @param dto - Reset token and new password payload.
   * @returns Success message with instructions for next login.
   * @status 200 OK
   *
   * @throws {BadRequestException} If token is invalid, expired, or already used.
   *
   * @remarks
   * Flow:
   * [STEP 1] Validate request payload format via DTO.
   * [STEP 2] Hash incoming token for secure database comparison.
   * [STEP 3] Query database for matching token hash.
   * [STEP 4] Verify token has not expired.
   * [STEP 5] Hash new password with bcrypt (cost factor 10).
   * [STEP 6] Update user password atomically.
   * [STEP 7] Delete reset token (one-time use enforcement).
   * [STEP 8] Return success message.
   *
   * Security:
   * - Token comparison uses cryptographic hash, not plain text.
   * - Password is bcrypt-hashed with sufficient cost factor.
   * - Token is immediately invalidated after successful reset.
   * - Token is deleted on expiry to prevent replay attacks.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}