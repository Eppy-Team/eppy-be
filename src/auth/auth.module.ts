import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { MailModule } from 'src/mail/mail.module';
import { StringValue } from 'ms';

/**
 * Authentication Module
 *
 * The central security gateway for user identity, credential verification, and stateless session management.
 * Manages user registration, login, JWT token issuance, and password reset flows.
 *
 * Features:
 * - User Registration: Email validation, password hashing (bcrypt cost 10), account creation.
 * - User Authentication: Credential verification, JWT token issuance, session retrieval.
 * - Password Reset: Forgot password flow with email link, secure token validation, password update.
 *
 * Architecture:
 * - Passport.js Strategy: JWT strategy for route-level authorization.
 * - JWT Module: Asynchronous configuration from environment variables.
 * - Mail Integration: Sends password reset emails via AWS SES.
 * - Security: One-way password hashing, cryptographically secure tokens, timing-safe comparisons.
 *
 * @remarks
 * Integration:
 * - Other modules can inject JwtModule to protect endpoints via JwtAuthGuard.
 * - Exported AuthService provides register/login/me/forgotPassword/resetPassword methods.
 * - Exported JwtModule enables JWT verification in guards and strategies.
 * - MailModule integration for transactional password reset emails.
 *
 * Security Principles:
 * - Passwords are bcrypt-hashed (never stored as plain text).
 * - Reset tokens are cryptographically random (32 bytes) and hashed before storage.
 * - JWT secret is loaded from environment (never hardcoded).
 * - Generic error messages prevent account enumeration attacks.
 * - All sensitive operations are logged for security monitoring.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET_KEY'),
        signOptions: {
          expiresIn: config.get<StringValue>('JWT_EXPIRES_IN') || '1d',
        },
      }),
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtStrategy, PrismaService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}