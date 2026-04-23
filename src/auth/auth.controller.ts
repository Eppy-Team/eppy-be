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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/get-user.decorator';

/**
 * Authentication Controller
 * * Exposes REST API endpoints for identity management. 
 * Orchestrates user onboarding, authentication sessions, and secure 
 * profile retrieval.
 *
 * Security:
 * - Bearer Token: Protected endpoints require a valid JWT in the Authorization header.
 * - Input Validation: All payloads are sanitized via class-validator DTOs.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user account.
   * * Validates and persists a new user entity.
   *
   * @param dto - Registration payload (Name, Email, Password).
   * @returns Standard response with the created user profile.
   * @status 201 Created
   */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Authenticate user and issue a session token.
   * * Verifies credentials and returns a stateless JWT for subsequent access.
   *
   * @param dto - Identity credentials.
   * @returns Authentication bundle (JWT Access Token + User Metadata).
   * @status 200 OK
   * * @remarks
   * Clients must include the returned `accessToken` in the `Authorization` 
   * header as `Bearer <token>` for all protected requests.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * Retrieve the current session's profile.
   * * Fetches authenticated user details derived from the active JWT context.
   *
   * @param userId - Extracted from the validated JWT payload sub-claim.
   * @returns Current user data (Sanitized).
   * @status 200 OK
   * * @security JWT Bearer Authentication
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser('id') userId: string) {
    return this.authService.me(userId);
  }
}