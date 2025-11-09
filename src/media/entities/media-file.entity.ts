import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
}

export enum MediaCategory {
  PROFILE_PHOTO = 'profile_photo',
  MEDICAL_REPORT = 'medical_report',
  MEDICATION_PHOTO = 'medication_photo',
  VITALS_CHART = 'vitals_chart',
  EMERGENCY_CONTACT = 'emergency_contact',
  INSURANCE_DOCUMENT = 'insurance_document',
  VOICE_NOTE = 'voice_note',
  VIDEO_CALL_RECORDING = 'video_call_recording',
  OTHER = 'other',
}

@Entity('media_files')
@Index(['userId', 'createdAt'])
@Index(['mediaType', 'category'])
@Index(['isActive', 'createdAt'])
export class MediaFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 255 })
  fileName: string; // Stored file name

  @Column({ type: 'varchar', length: 500 })
  filePath: string; // S3 key or file path

  @Column({ type: 'varchar', length: 500, nullable: true })
  publicUrl: string; // Public accessible URL

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ type: 'bigint' })
  fileSize: number; // Size in bytes

  @Column({
    type: 'enum',
    enum: MediaType,
  })
  mediaType: MediaType;

  @Column({
    type: 'enum',
    enum: MediaCategory,
    default: MediaCategory.OTHER,
  })
  category: MediaCategory;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional file metadata (dimensions, duration, etc.)

  @Column({ type: 'varchar', length: 100, nullable: true })
  checksum: string; // File integrity check

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isProcessed: boolean; // For files that need processing (thumbnails, transcoding, etc.)

  @Column({ type: 'boolean', default: false })
  isPublic: boolean; // Whether file is publicly accessible

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date; // For temporary files

  @Column({ type: 'jsonb', nullable: true })
  processingStatus: Record<string, any>; // Status of various processing tasks

  @Column({ type: 'varchar', length: 255, nullable: true })
  thumbnailPath: string; // Path to thumbnail (for images/videos)

  @Column({ type: 'text', array: true, default: [] })
  tags: string[]; // Searchable tags

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get isImage(): boolean {
    return this.mediaType === MediaType.IMAGE;
  }

  get isVideo(): boolean {
    return this.mediaType === MediaType.VIDEO;
  }

  get isAudio(): boolean {
    return this.mediaType === MediaType.AUDIO;
  }

  get isDocument(): boolean {
    return this.mediaType === MediaType.DOCUMENT;
  }

  get isExpired(): boolean {
    return this.expiresAt ? new Date() > this.expiresAt : false;
  }

  get fileSizeFormatted(): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = this.fileSize;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  }

  markAsProcessed(processingResults?: Record<string, any>): void {
    this.isProcessed = true;
    if (processingResults) {
      this.processingStatus = {
        ...this.processingStatus,
        ...processingResults,
        processedAt: new Date(),
      };
    }
  }

  addTag(tag: string): void {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
    }
  }

  removeTag(tag: string): void {
    this.tags = this.tags.filter(t => t !== tag);
  }

  setExpiration(hours: number): void {
    this.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  }
}
