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
}