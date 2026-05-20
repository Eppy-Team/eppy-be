import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * Forgot Password DTO
 *
 * Payload for initiating password reset flow when user cannot access their account.
 * Triggers secure email delivery with time-limited reset token.
 *
 * @remarks
 * Security Considerations:
 * - Email address is validated against RFC 5322 standard.
 * - Generic response returned regardless of email existence to prevent account enumeration.
 * - Reset token is one-time use with 15-minute expiry.
 */
export class ForgotPasswordDto {
  /**
   * Registered email address associated with the user account.
   *
   * @validation Valid email format required (RFC 5322 compliant).
   * @example "user@example.com"
   */
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email!: string;
}