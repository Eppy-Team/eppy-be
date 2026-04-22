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
 * Multer Configuration for Knowledge Article File Upload
 *
 * Configures file upload handling untuk Knowledge API endpoints.
 *
 * Configuration:
 * - Storage: In-memory storage (buffer di-load ke memory, bukan disk)
 * - File Filter: Hanya accept PDF files (application/pdf)
 * - File Size Limit: Maximum 10MB per file
 * - Validation: MIME type checking di fileFilter callback
 *
 * File Flow:
 * 1. Client uploads PDF file via multipart/form-data
 * 2. Multer validates MIME type dan file size
 * 3. File buffer disimpan di memory storage
 * 4. File di-pass ke KnowledgeService untuk S3 upload
 *
 * @throws BadRequestException - Jika file bukan PDF atau size exceeds limit
 *
 * @remarks
 * In-memory storage digunakan untuk non-blocking S3 operations.
 * Tidak cocok untuk file upload di-disk. Untuk production dengan
 * ukuran file besar, pertimbangkan streaming langsung ke S3.
 */
const multerOptions = {
  storage: memoryStorage(),
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(
        new BadRequestException('Hanya file PDF yang diizinkan'),
        false,
      );
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
};

/**
 * Knowledge Controller
 *
 * REST API controller untuk knowledge base management.
 * Menangani HTTP requests untuk CRUD operations pada knowledge articles.
 *
 * Features:
 * - GET /knowledge - Retrieve paginated articles list
 * - GET /knowledge/:id - Retrieve single article details
 * - POST /knowledge - Create new article dengan PDF upload
 * - PATCH /knowledge/:id - Update article metadata
 * - DELETE /knowledge/:id - Delete article dan associated resources
 *
 * Security:
 * - Requires JwtAuthGuard untuk authentication (valid JWT token)
 * - Requires RolesGuard untuk authorization (ADMIN role only)
 * - All endpoints restricted ke admin users
 *
 * File Upload:
 * - POST endpoint menggunakan FileInterceptor untuk multipart/form-data handling
 * - Multer configuration di-apply untuk validation (PDF only, max 10MB)
 *
 * Dependencies:
 * - KnowledgeService: Business logic layer
 * - JWT Authentication Guard: Token validation
 * - Role-Based Access Control: Admin authorization
 *
 * @see KnowledgeService untuk business logic implementation
 * @see JwtAuthGuard untuk authentication details
 * @see RolesGuard untuk authorization details
 */
@Controller('knowledge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  /**
   * GET /knowledge - Retrieve paginated list of knowledge articles
   *
   * Fetches articles dari database dengan support pagination.
   * Results di-sort by creation date (newest first).
   *
   * Query Parameters:
   * @param page - Page number untuk pagination (default: 1, minimum: 1)
   * @param limit - Items per page (default: 10, recommend: 10-50)
   *
   * Response:
   * - message: Success message
   * - data: Array of article objects
   * - meta: Pagination metadata (total, page, lastPage, limit)
   *
   * HTTP Status: 200 OK
   *
   * @example
   * GET /knowledge?page=1&limit=10
   * GET /knowledge (uses defaults)
   *
   * @remarks
   * Pagination calculation: skip = (page - 1) * limit
   * LastPage dihitung dari: ceil(total / limit)
   */
  @Get()
  async findAll(@Query('page') page: string, @Query('limit') limit: string) {
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;

    return this.knowledgeService.findAll(pageNumber, limitNumber);
  }

  /**
   * GET /knowledge/:id - Retrieve single article with complete details
   *
   * Fetches single article by ID dengan semua informasi lengkap termasuk
   * content, embedding status, dan author information.
   *
   * Path Parameter:
   * @param id - Article UUID (validated oleh ParseUUIDPipe)
   *
   * Response:
   * - message: Success message
   * - data: Complete article object dengan author info
   *
   * HTTP Status: 200 OK
   * HTTP Status: 404 Not Found - Jika article tidak ditemukan
   *
   * @example
   * GET /knowledge/550e8400-e29b-41d4-a716-446655440000
   *
   * @throws NotFoundException - Article dengan ID tidak ada di database
   *
   * @remarks
   * ID parameter otomatis di-validate sebagai valid UUID format.
   * Invalid UUID akan reject dengan 400 Bad Request sebelum ke service.
   */
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledgeService.findById(id);
  }

  /**
   * POST /knowledge - Create new knowledge article dengan file upload
   *
   * Creates new article record dan uploads associated PDF file ke S3.
   * Embedding processing di-trigger secara asynchronous setelah response.
   *
   * Request:
   * Content-Type: multipart/form-data
   *
   * Form Fields:
   * @param dto - CreateKnowledgeDto (title, category) dalam form field
   * @param file - PDF file dengan field name 'file' (required, max 10MB)
   * @param userId - Extracted dari JWT token automatically (@CurrentUser decorator)
   *
   * Response:
   * - message: Success message dengan processing status
   * - data: Created article object dengan metadata
   *
   * HTTP Status: 201 Created
   * HTTP Status: 400 Bad Request - File missing atau invalid format
   *
   * @example
   * POST /knowledge
   * Content-Type: multipart/form-data
   * 
   * form fields:
   * - title: "Best Practices in NestJS"
   * - category: "Backend Development"
   * - file: (PDF file)
   *
   * @throws BadRequestException - File tidak diunggah atau bukan PDF
   *
   * @remarks
   * File validation dilakukan di Multer middleware (MIME type, size).
   * Embedding processing berjalan di background tanpa memblock response.
   * Status embedding awal: PENDING, akan berubah ke DONE atau FAILED.
   * userId diambil otomatis dari JWT token (decoded by CurrentUser decorator).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async create(
    @Body() dto: CreateKnowledgeDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('File PDF wajib diunggah');
    }
    return this.knowledgeService.create(dto, file, userId);
  }

  /**
   * PATCH /knowledge/:id - Update existing article metadata
   *
   * Updates article title dan/atau category. Update akan trigger
   * re-embedding process untuk generate ulang embeddings dengan context baru.
   *
   * Path Parameter:
   * @param id - Article UUID (validated oleh ParseUUIDPipe)
   *
   * Request Body:
   * @param dto - UpdateKnowledgeDto dengan optional title dan category
   *             (minimal satu field harus ada)
   *
   * Response:
   * - message: Success message
   * - data: Updated article object
   *
   * HTTP Status: 200 OK
   * HTTP Status: 404 Not Found - Article tidak ditemukan
   *
   * @example
   * PATCH /knowledge/550e8400-e29b-41d4-a716-446655440000
   * Body: {
   *   "title": "Updated Article Title",
   *   "category": "New Category"
   * }
   *
   * @throws NotFoundException - Article dengan ID tidak ada
   *
   * @remarks
   * Embedding status otomatis di-set ke PENDING untuk trigger re-embedding.
   * Re-embedding berjalan asynchronously di background.
   * File (PDF) tidak dapat diupdate melalui PATCH endpoint.
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeDto,
  ) {
    return this.knowledgeService.update(id, dto);
  }

  /**
   * DELETE /knowledge/:id - Delete article dan associated resources
   *
   * Performs cascade deletion:
   * 1. Delete article record dari database (synchronous)
   * 2. Delete PDF file dari S3 storage (asynchronous, fire-and-forget)
   * 3. Delete embeddings dari AI service (asynchronous, fire-and-forget)
   *
   * Path Parameter:
   * @param id - Article UUID (validated oleh ParseUUIDPipe)
   *
   * Response:
   * - 204 No Content (empty response body)
   *
   * HTTP Status: 204 No Content - Success, tidak ada response body
   * HTTP Status: 404 Not Found - Article tidak ditemukan
   *
   * @example
   * DELETE /knowledge/550e8400-e29b-41d4-a716-446655440000
   * Response: 204 No Content
   *
   * @throws NotFoundException - Article dengan ID tidak ada
   *
   * @remarks
   * 204 No Content: Standard REST convention untuk successful DELETE.
   * File dan embedding deletion async - errors tidak mempengaruhi response.
   * Asynchronous deletion di-log tapi tidak di-throw ke client.
   * Database deletion synchronous - dijalankan sebelum response dikirim.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledgeService.delete(id);
  }
}
