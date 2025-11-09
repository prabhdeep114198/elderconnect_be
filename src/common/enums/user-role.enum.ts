export enum UserRole {
  ELDER = 'elder',
  CAREGIVER = 'caregiver',
  ADMIN = 'admin',
}

export enum DeviceType {
  WEARABLE = 'wearable',
  SENSOR = 'sensor',
  MOBILE = 'mobile',
  EMERGENCY = 'emergency',
}

export enum AlertPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum NotificationType {
  SMS = 'sms',
  PUSH = 'push',
  EMAIL = 'email',
}

export enum AuditAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  SOS = 'sos',
}

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
}
