import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { MediaService } from './media.service';
import { UploadMediaDto, UpdateMediaDto, MediaQueryDto, PresignedUrlDto } from './dto/media.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('Media')
@Controller('v1/media')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@UseInterceptors(AuditLogInterceptor)
@ApiBearerAuth()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // File Upload Endpoints
  @Post('upload/presigned')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate presigned URL for file upload' })
  @ApiResponse({ status: 201, description: 'Presigned URL generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file parameters' })
  async generatePresignedUploadUrl(
    @Body() presignedUrlDto: PresignedUrlDto,
    @CurrentUser() currentUser,
  ) {
    const result = await this.mediaService.generatePresignedUploadUrl(
      currentUser.id,
      presignedUrlDto,
    );

    return {
      message: 'Presigned URL generated successfully',
      data: result,
    };
  }

  @Post('upload/confirm/:fileId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm file upload completion' })
  @ApiResponse({ status: 200, description: 'File upload confirmed successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async confirmUpload(
    @Param('fileId') fileId: string,
    @CurrentUser() currentUser,
  ) {
    const mediaFile = await this.mediaService.confirmUpload(currentUser.id, fileId);

    return {
      message: 'File upload confirmed successfully',
      data: { mediaFile },
    };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload file directly' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or parameters' })
  async uploadFile(
    @UploadedFile() file: any,
    @Body() uploadMediaDto: UploadMediaDto,
    @CurrentUser() currentUser,
  ) {
    if (!file) {
      throw new Error('No file provided');
    }

    const mediaFile = await this.mediaService.uploadFile(
      currentUser.id,
      file,
      uploadMediaDto,
    );

    return {
      message: 'File uploaded successfully',
      data: { mediaFile },
    };
  }

  // File Retrieval Endpoints
  @Get()
  @ApiOperation({ summary: 'Get user media files' })
  @ApiQuery({ name: 'category', required: false, enum: ['profile_photo', 'medical_report', 'medication_photo', 'vitals_chart', 'emergency_contact', 'insurance_document', 'voice_note', 'video_call_recording', 'other'] })
  @ApiQuery({ name: 'mediaType', required: false, enum: ['image', 'video', 'audio', 'document'] })
  @ApiQuery({ name: 'tags', required: false, type: String })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Media files retrieved successfully' })
  async getMediaFiles(
    @Query() queryDto: MediaQueryDto,
    @CurrentUser() currentUser,
  ) {
    const result = await this.mediaService.getMediaFiles(currentUser.id, queryDto);

    return {
      message: 'Media files retrieved successfully',
      data: result,
    };
  }

  @Get(':fileId')
  @ApiOperation({ summary: 'Get specific media file details' })
  @ApiResponse({ status: 200, description: 'Media file retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Media file not found' })
  async getMediaFile(
    @Param('fileId') fileId: string,
    @CurrentUser() currentUser,
  ) {
    const mediaFile = await this.mediaService.getMediaFile(currentUser.id, fileId);

    return {
      message: 'Media file retrieved successfully',
      data: { mediaFile },
    };
  }

  @Get('public/:fileId')
  @ApiOperation({ summary: 'Get public media file' })
  @ApiResponse({ status: 200, description: 'Public media file retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Public media file not found' })
  async getPublicMediaFile(@Param('fileId') fileId: string) {
    const mediaFile = await this.mediaService.getPublicMediaFile(fileId);

    return {
      message: 'Public media file retrieved successfully',
      data: { mediaFile },
    };
  }

  // File Management Endpoints
  @Put(':fileId')
  @ApiOperation({ summary: 'Update media file metadata' })
  @ApiResponse({ status: 200, description: 'Media file updated successfully' })
  @ApiResponse({ status: 404, description: 'Media file not found' })
  async updateMediaFile(
    @Param('fileId') fileId: string,
    @Body() updateMediaDto: UpdateMediaDto,
    @CurrentUser() currentUser,
  ) {
    const mediaFile = await this.mediaService.updateMediaFile(
      currentUser.id,
      fileId,
      updateMediaDto,
    );

    return {
      message: 'Media file updated successfully',
      data: { mediaFile },
    };
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete media file' })
  @ApiResponse({ status: 204, description: 'Media file deleted successfully' })
  @ApiResponse({ status: 404, description: 'Media file not found' })
  async deleteMediaFile(
    @Param('fileId') fileId: string,
    @CurrentUser() currentUser,
  ) {
    await this.mediaService.deleteMediaFile(currentUser.id, fileId);

    return {
      message: 'Media file deleted successfully',
    };
  }

  @Put(':fileId/deactivate')
  @ApiOperation({ summary: 'Soft delete media file' })
  @ApiResponse({ status: 200, description: 'Media file deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Media file not found' })
  async deactivateMediaFile(
    @Param('fileId') fileId: string,
    @CurrentUser() currentUser,
  ) {
    const mediaFile = await this.mediaService.softDeleteMediaFile(currentUser.id, fileId);

    return {
      message: 'Media file deactivated successfully',
      data: { mediaFile },
    };
  }

  // Download Endpoints
  @Get(':fileId/download-url')
  @ApiOperation({ summary: 'Generate download URL for media file' })
  @ApiQuery({ name: 'expiresIn', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Download URL generated successfully' })
  @ApiResponse({ status: 404, description: 'Media file not found' })
  async generateDownloadUrl(
    @Param('fileId') fileId: string,
    @Query('expiresIn') expiresIn: number = 3600,
    @CurrentUser() currentUser,
  ) {
    const result = await this.mediaService.generateDownloadUrl(
      currentUser.id,
      fileId,
      expiresIn,
    );

    return {
      message: 'Download URL generated successfully',
      data: result,
    };
  }

  @Get(':fileId/download')
  @ApiOperation({ summary: 'Download media file directly' })
  @ApiResponse({ status: 200, description: 'File downloaded successfully' })
  @ApiResponse({ status: 404, description: 'Media file not found' })
  async downloadFile(
    @Param('fileId') fileId: string,
    @CurrentUser() currentUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, mediaFile } = await this.mediaService.downloadFile(
      currentUser.id,
      fileId,
    );

    res.set({
      'Content-Type': mediaFile.mimeType,
      'Content-Disposition': `attachment; filename="${mediaFile.originalName}"`,
      'Content-Length': buffer.length.toString(),
    });

    return new StreamableFile(buffer);
  }

  // Processing Endpoints
  @Post(':fileId/thumbnail')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate thumbnail for media file' })
  @ApiResponse({ status: 201, description: 'Thumbnail generation initiated' })
  @ApiResponse({ status: 400, description: 'Thumbnail not supported for this file type' })
  async generateThumbnail(
    @Param('fileId') fileId: string,
    @CurrentUser() currentUser,
  ) {
    const mediaFile = await this.mediaService.generateThumbnail(currentUser.id, fileId);

    return {
      message: 'Thumbnail generation initiated',
      data: { mediaFile },
    };
  }

  // Analytics Endpoints
  @Get('analytics/storage-usage')
  @ApiOperation({ summary: 'Get storage usage analytics' })
  @ApiResponse({ status: 200, description: 'Storage usage retrieved successfully' })
  async getStorageUsage(@CurrentUser() currentUser) {
    const usage = await this.mediaService.getStorageUsage(currentUser.id);

    return {
      message: 'Storage usage retrieved successfully',
      data: usage,
    };
  }

  // Admin Endpoints
  @Post('admin/cleanup-expired')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cleanup expired files (Admin only)' })
  @ApiResponse({ status: 200, description: 'Expired files cleaned up successfully' })
  async cleanupExpiredFiles(@CurrentUser() currentUser) {
    const deletedCount = await this.mediaService.cleanupExpiredFiles();

    return {
      message: 'Expired files cleaned up successfully',
      data: { deletedCount },
    };
  }

  // User-specific endpoints for caregivers/admins
  @Get('users/:userId/files')
  @Roles(UserRole.CAREGIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get media files for specific user (Caregiver/Admin only)' })
  @ApiResponse({ status: 200, description: 'User media files retrieved successfully' })
  async getUserMediaFiles(
    @Param('userId') userId: string,
    @Query() queryDto: MediaQueryDto,
    @CurrentUser() currentUser,
  ) {
    const result = await this.mediaService.getMediaFiles(userId, queryDto);

    return {
      message: 'User media files retrieved successfully',
      data: result,
    };
  }

  @Get('users/:userId/storage-usage')
  @Roles(UserRole.CAREGIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get storage usage for specific user (Caregiver/Admin only)' })
  @ApiResponse({ status: 200, description: 'User storage usage retrieved successfully' })
  async getUserStorageUsage(
    @Param('userId') userId: string,
    @CurrentUser() currentUser,
  ) {
    const usage = await this.mediaService.getStorageUsage(userId);

    return {
      message: 'User storage usage retrieved successfully',
      data: usage,
    };
  }
}
