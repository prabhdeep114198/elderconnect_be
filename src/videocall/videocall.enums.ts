export enum CallStatus {
  PENDING  = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  MISSED   = 'missed',
  ENDED    = 'ended',
  FAILED   = 'failed',
}

export enum CallType {
  VIDEO = 'video',
  VOICE = 'voice',
}