import { IsString, IsNotEmpty, MinLength } from 'class-validator';

/**
 * Reset Password DTO
 *
 * Payload for resetting a forgotten password using a valid reset token.
 * Implements strict validation to ensure token authenticity and password strength.
 *
 * @remarks
 * Security Considerations:
 * - Token must be the raw reset token (hashed comparison happens server-side).
 * - New password must meet minimum length requirements (8+ characters).
 * - Token validation includes expiry check and one-time use enforcement.
 */
export class ResetPasswordDto {
  /**
   * Password reset token (raw format, not hashed).
   *
   * This is the token sent via email reset link query parameter.
   * Server hashes this token for secure comparison against stored hash.
   *
   * @validation Non-empty string required.
   * @example "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
   */
  @IsString()
  @IsNotEmpty()
  token!: string;

  /**
   * New password (plain-text, will be bcrypt hashed server-side).
   *
   * @validation Minimum 8 characters required for security compliance.
   * @example "SecureNewPassword123"
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword!: string;
}