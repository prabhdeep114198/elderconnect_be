import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import * as path from 'path';

export interface PresignedUploadResult {
  uploadUrl: string;
  fileKey: string;
  publicUrl: string;
  expiresIn: number;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresIn: number;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const bucketName = this.configService.get<string>('aws.s3.bucketName');
    const region = this.configService.get<string>('aws.region');
    const accessKeyId = this.configService.get<string>('aws.accessKeyId');
    const secretAccessKey = this.configService.get<string>('aws.secretAccessKey');

    if (!bucketName) {
      throw new Error('Missing required configuration: aws.s3.bucketName');
    }
    if (!region) {
      throw new Error('Missing required configuration: aws.region');
    }
    if (!accessKeyId) {
      throw new Error('Missing required configuration: aws.accessKeyId');
    }
    if (!secretAccessKey) {
      throw new Error('Missing required configuration: aws.secretAccessKey');
    }

    this.bucketName = bucketName;
    this.region = region;
    this.publicBaseUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com`;

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async generatePresignedUploadUrl(
    userId: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
    category?: string,
  ): Promise<PresignedUploadResult> {
    try {
      const fileKey = this.generateFileKey(userId, fileName, category);
      const expiresIn = 3600; // 1 hour

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        ContentType: mimeType,
        ContentLength: fileSize,
        Metadata: {
          userId,
          originalName: fileName,
          category: category || 'other',
          uploadedAt: new Date().toISOString(),
        },
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      const publicUrl = `${this.publicBaseUrl}/${fileKey}`;

      this.logger.debug(`Generated presigned upload URL for user ${userId}, file: ${fileName}`);

      return {
        uploadUrl,
        fileKey,
        publicUrl,
        expiresIn,
      };
    } catch (error) {
      this.logger.error('Failed to generate presigned upload URL', error);
      throw error;
    }
  }

  async generatePresignedDownloadUrl(
    fileKey: string,
    expiresIn: number = 3600,
  ): Promise<PresignedDownloadResult> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

      this.logger.debug(`Generated presigned download URL for file: ${fileKey}`);

      return {
        downloadUrl,
        expiresIn,
      };
    } catch (error) {
      this.logger.error(`Failed to generate presigned download URL for file: ${fileKey}`, error);
      throw error;
    }
  }

  async uploadFile(
    fileKey: string,
    fileBuffer: Buffer,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: mimeType,
        Metadata: metadata,
      });

      await this.s3Client.send(command);
      const publicUrl = `${this.publicBaseUrl}/${fileKey}`;

      this.logger.debug(`File uploaded successfully: ${fileKey}`);
      return publicUrl;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${fileKey}`, error);
      throw error;
    }
  }

  async downloadFile(fileKey: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const response = await this.s3Client.send(command);
      const chunks: Uint8Array[] = [];

      if (response.Body) {
        // @ts-ignore
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
      }

      const buffer = Buffer.concat(chunks);
      this.logger.debug(`File downloaded successfully: ${fileKey}`);
      return buffer;
    } catch (error) {
      this.logger.error(`Failed to download file: ${fileKey}`, error);
      throw error;
    }
  }

  async deleteFile(fileKey: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      await this.s3Client.send(command);
      this.logger.debug(`File deleted successfully: ${fileKey}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${fileKey}`, error);
      throw error;
    }
  }

  async fileExists(fileKey: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      this.logger.error(`Failed to check file existence: ${fileKey}`, error);
      throw error;
    }
  }

  async getFileMetadata(fileKey: string): Promise<Record<string, any> | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const response = await this.s3Client.send(command);
      
      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        etag: response.ETag,
        metadata: response.Metadata,
      };
    } catch (error) {
      if (error.name === 'NotFound') {
        return null;
      }
      this.logger.error(`Failed to get file metadata: ${fileKey}`, error);
      throw error;
    }
  }

  private generateFileKey(userId: string, fileName: string, category?: string): string {
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    
    // Sanitize filename
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    const categoryPath = category ? `${category}/` : '';
    const fileKey = `users/${userId}/${categoryPath}${timestamp}_${randomId}_${sanitizedBaseName}${extension}`;
    
    return fileKey;
  }

  getPublicUrl(fileKey: string): string {
    return `${this.publicBaseUrl}/${fileKey}`;
  }

  extractFileKeyFromUrl(url: string): string | null {
    const baseUrlPattern = new RegExp(`^${this.publicBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`);
    
    if (baseUrlPattern.test(url)) {
      return url.replace(baseUrlPattern, '');
    }
    
    return null;
  }

  // Utility methods for different file operations
  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      // First download the source file
      const fileBuffer = await this.downloadFile(sourceKey);
      const metadata = await this.getFileMetadata(sourceKey);
      
      // Then upload to destination
      await this.uploadFile(
        destinationKey,
        fileBuffer,
        metadata?.contentType || 'application/octet-stream',
        metadata?.metadata,
      );

      this.logger.debug(`File copied from ${sourceKey} to ${destinationKey}`);
    } catch (error) {
      this.logger.error(`Failed to copy file from ${sourceKey} to ${destinationKey}`, error);
      throw error;
    }
  }

  async moveFile(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      await this.copyFile(sourceKey, destinationKey);
      await this.deleteFile(sourceKey);
      
      this.logger.debug(`File moved from ${sourceKey} to ${destinationKey}`);
    } catch (error) {
      this.logger.error(`Failed to move file from ${sourceKey} to ${destinationKey}`, error);
      throw error;
    }
  }

  generateThumbnailKey(originalKey: string): string {
    const pathParts = originalKey.split('/');
    const fileName = pathParts.pop() ?? '';
    const directory = pathParts.join('/');
    
    return `${directory}/thumbnails/thumb_${fileName}`;
  }

  generateProcessedKey(originalKey: string, suffix: string): string {
    const pathParts = originalKey.split('/');
    const fileName = pathParts.pop() ?? '';
    const directory = pathParts.join('/');
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    
    return `${directory}/processed/${baseName}_${suffix}${extension}`;
  }
}
