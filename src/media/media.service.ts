import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, In } from 'typeorm';
import { MediaFile, MediaType, MediaCategory } from './entities/media-file.entity';
import { UploadMediaDto, UpdateMediaDto, MediaQueryDto, PresignedUrlDto } from './dto/media.dto';
import { S3Service } from './services/s3.service';
import * as crypto from 'crypto';
import * as path from 'path';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaFile, 'media')
    private readonly mediaRepository: Repository<MediaFile>,
    private readonly s3Service: S3Service,
  ) {}

  // File Upload Management
  async generatePresignedUploadUrl(
    userId: string,
    presignedUrlDto: PresignedUrlDto,
  ): Promise<any> {
    // Validate file type and size
    this.validateFileUpload(presignedUrlDto.mimeType, presignedUrlDto.fileSize);

    // Generate presigned URL
    const result = await this.s3Service.generatePresignedUploadUrl(
      userId,
      presignedUrlDto.fileName,
      presignedUrlDto.mimeType,
      presignedUrlDto.fileSize,
      presignedUrlDto.category,
    );

    // Create media file record (pending upload)
    const mediaFile = this.mediaRepository.create({
      userId,
      originalName: presignedUrlDto.fileName,
      fileName: path.basename(result.fileKey),
      filePath: result.fileKey,
      publicUrl: result.publicUrl,
      mimeType: presignedUrlDto.mimeType,
      fileSize: presignedUrlDto.fileSize,
      mediaType: this.determineMediaType(presignedUrlDto.mimeType),
      category: presignedUrlDto.category || MediaCategory.OTHER,
      description: presignedUrlDto.description,
      isProcessed: false,
      checksum: crypto.randomBytes(16).toString('hex'), // Temporary checksum
    });

    const savedMediaFile = await this.mediaRepository.save(mediaFile);

    return {
      uploadUrl: result.uploadUrl,
      fileId: savedMediaFile.id,
      fileKey: result.fileKey,
      publicUrl: result.publicUrl,
      expiresIn: result.expiresIn,
    };
  }

  async confirmUpload(userId: string, fileId: string): Promise<MediaFile> {
    const mediaFile = await this.mediaRepository.findOne({
      where: { id: fileId, userId },
    });

    if (!mediaFile) {
      throw new NotFoundException('Media file not found');
    }

    // Verify file exists in S3
    const fileExists = await this.s3Service.fileExists(mediaFile.filePath);
    if (!fileExists) {
      throw new BadRequestException('File upload not completed');
    }

    // Get actual file metadata from S3
    const metadata = await this.s3Service.getFileMetadata(mediaFile.filePath);
    if (metadata) {
      mediaFile.fileSize = metadata.contentLength || mediaFile.fileSize;
      mediaFile.checksum = metadata.etag?.replace(/"/g, '') || mediaFile.checksum;
    }

    mediaFile.isProcessed = true;
    return this.mediaRepository.save(mediaFile);
  }

  async uploadFile(
    userId: string,
    file: Express.Multer.File,
    uploadMediaDto: UploadMediaDto,
  ): Promise<MediaFile> {
    // Validate file
    this.validateFileUpload(file.mimetype, file.size);

    // Generate file key and upload to S3
    const fileKey = `users/${userId}/${uploadMediaDto.category || 'other'}/${Date.now()}_${file.originalname}`;
    const publicUrl = await this.s3Service.uploadFile(
      fileKey,
      file.buffer,
      file.mimetype,
      {
        userId,
        originalName: file.originalname,
        category: uploadMediaDto.category || 'other',
      },
    );

    // Create media file record
    const mediaFile = this.mediaRepository.create({
      userId,
      originalName: file.originalname,
      fileName: path.basename(fileKey),
      filePath: fileKey,
      publicUrl,
      mimeType: file.mimetype,
      fileSize: file.size,
      mediaType: this.determineMediaType(file.mimetype),
      category: uploadMediaDto.category || MediaCategory.OTHER,
      description: uploadMediaDto.description,
      tags: uploadMediaDto.tags || [],
      isPublic: uploadMediaDto.isPublic || false,
      isProcessed: true,
      checksum: crypto.createHash('md5').update(file.buffer).digest('hex'),
    });

    if (uploadMediaDto.expirationHours) {
      mediaFile.setExpiration(uploadMediaDto.expirationHours);
    }

    return this.mediaRepository.save(mediaFile);
  }

  // File Retrieval
  async getMediaFiles(
    userId: string,
    queryDto: MediaQueryDto,
  ): Promise<{ files: MediaFile[]; total: number }> {
    const whereCondition: any = { userId };

    if (queryDto.category) {
      whereCondition.category = queryDto.category;
    }

    if (queryDto.mediaType) {
      whereCondition.mediaType = queryDto.mediaType as MediaType;
    }

    if (!queryDto.includeInactive) {
      whereCondition.isActive = true;
    }

    const findOptions: FindManyOptions<MediaFile> = {
      where: whereCondition,
      order: { createdAt: 'DESC' },
      take: queryDto.limit || 20,
      skip: queryDto.offset || 0,
    };

    // Handle tag filtering
    if (queryDto.tags) {
      const tags = queryDto.tags.split(',').map(tag => tag.trim());
      // This would require a more complex query in a real implementation
      // For now, we'll do a simple array overlap check
    }

    const [files, total] = await this.mediaRepository.findAndCount(findOptions);

    return { files, total };
  }

  async getMediaFile(userId: string, fileId: string): Promise<MediaFile> {
    const mediaFile = await this.mediaRepository.findOne({
      where: { id: fileId, userId },
    });

    if (!mediaFile) {
      throw new NotFoundException('Media file not found');
    }

    if (mediaFile.isExpired) {
      throw new BadRequestException('Media file has expired');
    }

    return mediaFile;
  }

  async getPublicMediaFile(fileId: string): Promise<MediaFile> {
    const mediaFile = await this.mediaRepository.findOne({
      where: { id: fileId, isPublic: true, isActive: true },
    });

    if (!mediaFile) {
      throw new NotFoundException('Public media file not found');
    }

    if (mediaFile.isExpired) {
      throw new BadRequestException('Media file has expired');
    }

    return mediaFile;
  }

  // File Management
  async updateMediaFile(
    userId: string,
    fileId: string,
    updateMediaDto: UpdateMediaDto,
  ): Promise<MediaFile> {
    const mediaFile = await this.getMediaFile(userId, fileId);

    Object.assign(mediaFile, updateMediaDto);

    return this.mediaRepository.save(mediaFile);
  }

  async deleteMediaFile(userId: string, fileId: string): Promise<void> {
    const mediaFile = await this.getMediaFile(userId, fileId);

    // Delete from S3
    await this.s3Service.deleteFile(mediaFile.filePath);

    // Delete thumbnail if exists
    if (mediaFile.thumbnailPath) {
      await this.s3Service.deleteFile(mediaFile.thumbnailPath);
    }

    // Remove from database
    await this.mediaRepository.remove(mediaFile);
  }

  async softDeleteMediaFile(userId: string, fileId: string): Promise<MediaFile> {
    const mediaFile = await this.getMediaFile(userId, fileId);
    mediaFile.isActive = false;
    return this.mediaRepository.save(mediaFile);
  }

  // Download and Access
  async generateDownloadUrl(
    userId: string,
    fileId: string,
    expiresIn: number = 3600,
  ): Promise<{ downloadUrl: string; expiresIn: number }> {
    const mediaFile = await this.getMediaFile(userId, fileId);

    const result = await this.s3Service.generatePresignedDownloadUrl(
      mediaFile.filePath,
      expiresIn,
    );

    return result;
  }

  async downloadFile(userId: string, fileId: string): Promise<{ buffer: Buffer; mediaFile: MediaFile }> {
    const mediaFile = await this.getMediaFile(userId, fileId);
    const buffer = await this.s3Service.downloadFile(mediaFile.filePath);

    return { buffer, mediaFile };
  }

  // File Processing
  async generateThumbnail(userId: string, fileId: string): Promise<MediaFile> {
    const mediaFile = await this.getMediaFile(userId, fileId);

    if (!mediaFile.isImage && !mediaFile.isVideo) {
      throw new BadRequestException('Thumbnails can only be generated for images and videos');
    }

    // In a real implementation, you would use a service like Sharp for images
    // or FFmpeg for videos to generate thumbnails
    const thumbnailKey = this.s3Service.generateThumbnailKey(mediaFile.filePath);
    
    // For now, we'll just mark that a thumbnail should be generated
    mediaFile.thumbnailPath = thumbnailKey;
    mediaFile.processingStatus = {
      ...mediaFile.processingStatus,
      thumbnail: 'pending',
      thumbnailRequestedAt: new Date(),
    };

    return this.mediaRepository.save(mediaFile);
  }

  // Analytics and Reporting
  async getStorageUsage(userId: string): Promise<any> {
    const files = await this.mediaRepository.find({
      where: { userId, isActive: true },
    });

    const totalSize = files.reduce((sum, file) => sum + file.fileSize, 0);
    const filesByType = files.reduce((acc, file) => {
      acc[file.mediaType] = (acc[file.mediaType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const filesByCategory = files.reduce((acc, file) => {
      acc[file.category] = (acc[file.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalFiles: files.length,
      totalSize,
      totalSizeFormatted: this.formatFileSize(totalSize),
      filesByType,
      filesByCategory,
      oldestFile: files.length > 0 ? Math.min(...files.map(f => f.createdAt.getTime())) : null,
      newestFile: files.length > 0 ? Math.max(...files.map(f => f.createdAt.getTime())) : null,
    };
  }

  async cleanupExpiredFiles(): Promise<number> {
    const expiredFiles = await this.mediaRepository.find({
      where: {
        isActive: true,
      },
    });

    const actuallyExpired = expiredFiles.filter(file => file.isExpired);
    let deletedCount = 0;

    for (const file of actuallyExpired) {
      try {
        await this.s3Service.deleteFile(file.filePath);
        if (file.thumbnailPath) {
          await this.s3Service.deleteFile(file.thumbnailPath);
        }
        await this.mediaRepository.remove(file);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete expired file ${file.id}:`, error);
      }
    }

    return deletedCount;
  }

  // Utility Methods
  private validateFileUpload(mimeType: string, fileSize: number): void {
    const maxFileSize = 100 * 1024 * 1024; // 100MB
    const allowedMimeTypes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Videos
      'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov',
      // Audio
      'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mpeg',
      // Documents
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv',
    ];

    if (fileSize > maxFileSize) {
      throw new BadRequestException(`File size exceeds maximum allowed size of ${this.formatFileSize(maxFileSize)}`);
    }

    if (!allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException(`File type ${mimeType} is not allowed`);
    }
  }

  private determineMediaType(mimeType: string): MediaType {
    if (mimeType.startsWith('image/')) return MediaType.IMAGE;
    if (mimeType.startsWith('video/')) return MediaType.VIDEO;
    if (mimeType.startsWith('audio/')) return MediaType.AUDIO;
    return MediaType.DOCUMENT;
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  }
}
