import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

/**
 * Multer Configuration for Knowledge Article Uploads
 * * Configures the file upload pipeline for PDF documents.
 * Uses in-memory storage for efficient non-blocking S3 uploads.
 * * Validation:
 * - MIME Type: Strictly application/pdf.
 * - File Size: Max 10MB.
 */
const multerOptions = {
  storage: memoryStorage(),
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new BadRequestException('Only PDF files are allowed'), false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
};

/**
 * Knowledge Controller
 * * Management API for the system's knowledge base. 
 * Facilitates CRUD operations with integrated PDF processing and AI embedding orchestration.
 * * Security:
 * - Requires Admin role for all management operations.
 * - Enforces JWT authentication.
 */
@Controller('knowledge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  /**
   * Retrieve a paginated list of knowledge articles.
   * * @param page - Current page number (defaults to 1).
   * @param limit - Records per page (defaults to 10).
   * @returns Paginated articles sorted by creation date (descending).
   */
  @Get()
  async findAll(@Query('page') page: string, @Query('limit') limit: string) {
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    return this.knowledgeService.findAll(pageNumber, limitNumber);
  }

  /**
   * Retrieve comprehensive details of a single knowledge article.
   * * @param id - Article UUID.
   * @throws {NotFoundException} If the article does not exist.
   */
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledgeService.findById(id);
  }

  /**
   * Create a new knowledge article with file upload.
   * * Orchestrates the following flow:
   * 1. Validates multipart/form-data and PDF integrity.
   * 2. Uploads file to S3 and creates database record.
   * 3. Triggers background asynchronous AI embedding.
   * * @param dto - Article metadata (title, category).
   * @param file - PDF document (multipart/form-data).
   * @param userId - Admin user ID injected from JWT.
   * @throws {BadRequestException} If file is missing or invalid.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async create(
    @Body() dto: CreateKnowledgeDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('PDF file is required');
    return this.knowledgeService.create(dto, file, userId);
  }

  /**
   * Update knowledge article metadata.
   * * Updating title or category will trigger a re-embedding process 
   * to ensure AI context remains accurate.
   * * @param id - Article UUID.
   * @param dto - Partial metadata updates.
   * @remarks Re-embedding runs asynchronously in the background.
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeDto,
  ) {
    return this.knowledgeService.update(id, dto);
  }

  /**
   * Delete an article and its associated cloud resources.
   * * Performs a synchronous database deletion followed by asynchronous 
   * cleanup of S3 files and AI vector embeddings.
   * * @param id - Article UUID.
   * @returns 204 No Content on success.
   * @remarks File and embedding deletions are 'fire-and-forget' background tasks.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledgeService.delete(id);
  }
}