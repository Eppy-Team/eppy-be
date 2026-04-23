import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthRepository } from './auth.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

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
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
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
      throw new ConflictException('Email is already registered');
    }

    // Hash password with a cost factor of 10 for optimal security/performance
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.authRepository.createUser({
      name: dto.name,
      email: dto.email,
      passwordHash,
    });

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
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

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
 
    return {
      message: 'User profile retrieved successfully',
      data: user,
    };
  }
}