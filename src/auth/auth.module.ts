import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { StringValue } from 'ms';

/**
 * Authentication Module
 * * The central security gateway of the application. 
 * It manages user identity, credential verification, and the issuance of 
 * JSON Web Tokens (JWT) for stateless session management.
 *
 * @remarks
 * Architecture:
 * - Employs Passport.js as the middleware strategy for authorization.
 * - Configured with asynchronous JWT registration to ensure sensitive keys 
 * are loaded correctly from the environment.
 * * Integration:
 * - Other modules can use the exported `JwtModule` to handle token verification
 * via the global or route-specific `JwtAuthGuard`.
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
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtStrategy, PrismaService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}