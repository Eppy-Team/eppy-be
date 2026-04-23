import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthRepository } from '../auth.repository';
import { ConfigService } from '@nestjs/config';

/**
 * JWT Token Payload
 * * Represents the decoded structure of the claims embedded within the JWT.
 * These claims are used for identity propagation and authorization.
 */
export interface JwtPayload {
  /** Subject claim: The unique identifier of the user (UUID). */
  sub: string;
  /** User email address for secondary identification. */
  email: string;
  /** User classification for Role-Based Access Control (RBAC). */
  role: string;
}

/**
 * JWT Authentication Strategy
 * * The security validator for incoming requests. 
 * It intercepts the `Authorization: Bearer <token>` header, verifies its integrity,
 * and performs a final sanity check against the persistence layer.
 *
 * @remarks
 * Security Flow:
 * 1. Signature Verification: Confirms the token was signed with the server's secret.
 * 2. Expiration Check: Automatically rejects expired tokens based on the 'exp' claim.
 * 3. Persistence Validation: Ensures the account still exists in the database.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // Strict expiration enforcement
      secretOrKey: configService.get<string>('JWT_SECRET_KEY')!,
    });
  }

  /**
   * Post-Verification Validation.
   * * Executed after Passport successfully verifies the token signature. 
   * This method performs a database lookup to ensure the user is still active.
   *
   * @param payload - The verified and decoded JWT claims.
   * @returns The authenticated user object, attached to the request context.
   * @throws {UnauthorizedException} If the user account has been deleted or disabled.
   */
  async validate(payload: JwtPayload) {
    const user = await this.authRepository.findUserById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Authentication failed: User no longer exists');
    }

    return user;
  }
}