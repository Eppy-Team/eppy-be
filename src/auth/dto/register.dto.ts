import {
  Matches,
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * User Registration Request DTO
 * * Defines the requirements for creating a new account.
 * Enforces strict password complexity and field constraints to maintain 
 * database integrity and security.
 */
export class RegisterDto {
  /**
   * Full name or display name of the user.
   * @maxLength 50
   */
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(50, { message: 'Name must not exceed 50 characters' })
  name!: string;

  /**
   * Unique email address for the new account.
   */
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  /**
   * Secure password with complexity requirements.
   * * Constraints:
   * - Length: 8 to 20 characters.
   * - Composition: Must contain at least one letter and one number.
   */
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(20, { message: 'Password must not exceed 20 characters' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/, {
    message: 'Password must contain at least one letter and one number',
  })
  password!: string;
}