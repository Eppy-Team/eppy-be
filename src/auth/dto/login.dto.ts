import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Login Request DTO
 * * The data transfer object for user authentication.
 * It enforces basic structural validation before the credentials 
 * reach the authentication logic.
 */
export class LoginDto {
  /**
   * Registered user email address.
   * @example "user@example.com"
   */
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  /**
   * User password in plain text.
   * @remarks Handled as a sensitive field; never logged or exposed.
   */
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}