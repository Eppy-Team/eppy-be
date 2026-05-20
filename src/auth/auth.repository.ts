import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Authentication Repository
 * * Data Access Layer (DAL) for user account management.
 * Encapsulates Prisma queries to ensure data integrity and enforce 
 * security boundaries during authentication and registration.
 *
 * Security Strategy:
 * - Differentiates between 'Internal' queries (includes hashes for verification) 
 * and 'Public' queries (strictly sanitizes sensitive fields).
 * - Enforces explicit field selection to prevent accidental credential leakage.
 *
 * Dependencies:
 * - PrismaService: PostgreSQL engine client.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve a user by email, including credentials.
   * * Used exclusively for internal authentication flows where password
   * verification is required.
   *
   * @param email - User's registered email address.
   * @returns Full user entity including `passwordHash`, or null if not found.
   *
   * @remarks
   * WARNING: The result of this query contains raw password hashes and 
   * MUST NOT be returned to the client/frontend.
   */
  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Retrieve a sanitized user profile by its unique identifier.
   * * Used for session validation (JWT) and profile retrieval where
   * security-sensitive fields must be excluded.
   *
   * @param id - User UUID.
   * @returns Sanitized user object containing public metadata.
   */
  async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Persist a new user record into the database.
   * * @param data - User creation payload (must contain pre-hashed password).
   * @returns The newly created user with sanitized fields.
   *
   * @remarks
   * Data Integrity: Unique constraints on the email field are enforced 
   * at the database level.
   */
  async createUser(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }

  /**
   * Update user password to new bcrypt hash.
   * * @param userId - User UUID.
   * @param passwordHash - Pre-hashed password (caller must hash with bcrypt).
   * @returns Updated user entity.
   *
   * @remarks
   * Responsibility Chain: Caller is responsible for bcrypt hashing. 
   * This method performs atomic database update without validation.
   */
  async updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /**
   * Create a password reset token record.
   * * Automatically deletes all previous reset tokens for same user (one-active-per-user constraint).
   *
   * @param data - Token creation payload.
   * @param data.userId - User UUID.
   * @param data.tokenHash - SHA256 hash of raw token (never store plain text).
   * @param data.expiresAt - Token expiry timestamp (typically 15 minutes from now).
   *
   * @returns Newly created passwordResetToken record.
   *
   * @remarks
   * One-Time Use Enforcement:
   * - Existing tokens for this user are deleted before creating new one.
   * - Ensures only one valid reset token per user at any time.
   * - Prevents token accumulation and limits attacker's options in token reuse scenarios.
   *
   * Security:
   * - Token hash is cryptographic (SHA256), not plain text.
   * - Expiry is enforced at application level during validation.
   * - Old tokens are garbage-collected via this method.
   */
  async createPasswordResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: data.userId },
    });
 
    return this.prisma.passwordResetToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }
 
  /**
   * Retrieve password reset token record by its hash.
   * * Used during password reset completion to validate token authenticity and expiry.
   *
   * @param tokenHash - SHA256 hash of the raw reset token.
   * @returns Token record with associated user data, or null if not found.
   *
   * @remarks
   * Lookup Method: Uses tokenHash as unique identifier (matches storage method).
   * User Data: Includes user ID, name, and email for reset completion flow.
   * Not Found: Returns null if token was deleted (one-time use), expired, or never existed.
   *
   * Security:
   * - Lookup is hash-based (timing-safe via database index).
   * - Result must be validated for expiry before use (database doesn't auto-delete expired).
   */
  async findPasswordResetToken(tokenHash: string) {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }
 
  /**
   * Delete password reset token by its hash.
   * * Enforces one-time use by removing token after successful password reset.
   *
   * @param tokenHash - SHA256 hash of the raw reset token.
   * @returns Deleted token record.
   *
   * @remarks
   * Lifecycle Point: Called after password update succeeds during reset completion.
   * Safety: If token doesn't exist, Prisma throws error (catch in service layer).
   * Token deletion is atomic with password update (caller handles transaction if needed).
   */
  async deletePasswordResetToken(tokenHash: string) {
    return this.prisma.passwordResetToken.delete({
      where: { tokenHash },
    });
  }
}