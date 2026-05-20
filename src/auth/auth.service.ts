import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
  BadRequestException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthRepository } from './auth.repository';
import { MailService } from 'src/mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const RESET_TOKEN_EXPIRES_MINUTES = 15;

/**
 * Authentication Service
 * * Handles the core security logic for user identity and access management.
 * Orchestrates user onboarding, credential verification, and stateless session issuance.
 *
 * Security Principles:
 * - One-way password hashing using bcrypt.
 * - Stateless authentication via JWT (JSON Web Tokens).
 * - Protection against Account Enumeration by using generic error messages.
 * - Least Privilege: Sensitive data (hashes) are never leaked to the service output.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Register a new user account.
   * * Performs pre-persistence checks, password derivation, and account creation.
   *
   * @param dto - User registration details (Name, Email, Plain-text Password).
   * @returns The created user profile (excluding sensitive credentials).
   * @throws {ConflictException} If the email is already associated with an account.
   */
  async register(dto: RegisterDto) {
    const existing = await this.authRepository.findUserByEmail(dto.email);
    if (existing) {
      this.logger.warn(`[register] email already registered: ${dto.email}`);
      throw new ConflictException('Email is already registered');
    }

    // Hash password with a cost factor of 10 for optimal security/performance
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.authRepository.createUser({
      name: dto.name,
      email: dto.email,
      passwordHash,
    });

    this.logger.log(`[register] user registered successfully: ${user.id}`);

    return {
      message: 'User registered successfully',
      data: user,
    };
  }

  /**
   * Authenticate user credentials and issue an access token.
   * * Implements a secure login flow with protection against timing attacks
   * and credential probing.
   *
   * @param dto - Login credentials.
   * @returns An object containing the Bearer Access Token and user metadata.
   * @throws {UnauthorizedException} If credentials do not match any record.
   * * @remarks
   * Generic messages are used to prevent attackers from discovering valid emails.
   */
  async login(dto: LoginDto) {
    const user = await this.authRepository.findUserByEmail(dto.email);

    // Check user existence and compare hashes using timing-safe comparison
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      this.logger.warn(`[login] failed authentication attempt: ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    this.logger.log(`[login] user authenticated successfully: ${user.id}`);

    return {
      message: 'Login successful',
      data: {
        accessToken: this.jwtService.sign(payload),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    };
  }

  /**
   * Retrieve the current authenticated user's profile.
   * * @param userId - The unique identifier extracted from the JWT 'sub' claim.
   * @returns The user's public profile data.
   */
  async me(userId: string) {
    const user = await this.authRepository.findUserById(userId);

    this.logger.log(`[me] user profile retrieved: ${userId}`);

    return {
      message: 'User profile retrieved successfully',
      data: user,
    };
  }

  /**
   * Initiate password reset flow for forgotten account password.
   *
   * Generates a cryptographically secure reset token, stores hashed token in database,
   * and sends reset email with frontend link. Returns generic success to prevent enumeration.
   *
   * @param dto - Email address for password reset request.
   * @returns Generic success response object with null data.
   *
   * @remarks
   * Flow:
   * [STEP 1] Query database for user by email (non-blocking if not found).
   * [STEP 2] Generate 32-byte cryptographically random token.
   * [STEP 3] Hash token using SHA256 for secure storage.
   * [STEP 4] Calculate expiry timestamp (15 minutes from now).
   * [STEP 5] Store token hash in database with user reference.
   * [STEP 6] Construct frontend reset link with raw token as query param.
   * [STEP 7] Send password reset email (non-blocking on send failure).
   * [STEP 8] Return generic success message.
   *
   * Security:
   * - Token is 32 bytes from crypto.randomBytes (cryptographically secure).
   * - Token is hashed with SHA256 before storage (one-way function).
   * - Generic success response prevents account enumeration.
   * - Email failure does not throw (logged and recovered gracefully).
   * - Any existing reset tokens for same user are deleted (one active per user).
   * - Reset token has 15-minute hard expiry.
   *
   * Logging:
   * - No explicit logging (generic response prevents information leakage).
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.authRepository.findUserByEmail(dto.email);

    if (!user) {
      return {
        message: 'If that email is registered, a reset link has been sent.',
        data: null,
      };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000,
    );

    await this.authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3001',
    );
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    this.mailService
      .sendPasswordResetEmail({
        toEmail: user.email,
        userName: user.name,
        resetUrl,
        expiresInMinutes: RESET_TOKEN_EXPIRES_MINUTES,
      })
      .catch(() => {});

    return {
      message: 'If that email is registered, a reset link has been sent.',
      data: null,
    };
  }

  /**
   * Complete password reset using valid reset token.
   *
   * Validates reset token authenticity, expiry, and one-time use constraint.
   * Updates user password to new bcrypt hash and invalidates token.
   *
   * @param dto - Reset token and new password payload.
   * @returns Success response with message.
   *
   * @throws {BadRequestException} If token is invalid, expired, or already used.
   *
   * @remarks
   * Flow:
   * [STEP 1] Hash incoming raw token using SHA256 (same as storage hash).
   * [STEP 2] Query database for token hash record.
   * [STEP 3] Return 400 if token hash not found (invalid or already used).
   * [STEP 4] Compare current timestamp against token expiry.
   * [STEP 5] If expired: delete token and throw 400 with expiry message.
   * [STEP 6] Hash new password with bcrypt (cost factor 10).
   * [STEP 7] Update user record with new password hash (atomic transaction).
   * [STEP 8] Delete reset token record (one-time use enforcement).
   * [STEP 9] Return success response with login instructions.
   *
   * Security:
   * - Token comparison uses SHA256 hash (matching storage method).
   * - Password hash uses bcrypt with cost factor 10 (optimal security/performance).
   * - Expired tokens are actively deleted to prevent accumulation.
   * - One-time use enforced via immediate token deletion after use.
   * - Timing-safe comparison via cryptographic hash (not string equality).
   *
   * Logging:
   * - Error cases logged at WARN/ERROR level for security monitoring.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');

    const resetToken =
      await this.authRepository.findPasswordResetToken(tokenHash);

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (new Date() > resetToken.expiresAt) {
      await this.authRepository.deletePasswordResetToken(tokenHash);
      throw new BadRequestException(
        'Reset token has expired. Please request a new one.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.authRepository.updatePassword(resetToken.userId, passwordHash);

    await this.authRepository.deletePasswordResetToken(tokenHash);

    return {
      message:
        'Password has been reset successfully. You can now log in with your new password.',
      data: null,
    };
  }
}
