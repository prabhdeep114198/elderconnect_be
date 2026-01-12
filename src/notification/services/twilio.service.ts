import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  cost?: string;
  status?: string;
}

export interface VoiceCallResult {
  success: boolean;
  callId?: string;
  error?: string;
  status?: string;
}

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private readonly client: Twilio;
  private readonly fromNumber: string;

  constructor(private readonly configService: ConfigService) {
    // Make these optional since we are switching to N8N
    const accountSid = this.configService.get<string>('twilio.accountSid');
    const authToken = this.configService.get<string>('twilio.authToken');
    // Don't throw if missing, just default to empty string or null
    this.fromNumber = this.configService.get<string>('twilio.fromNumber') || '';

    if (!accountSid || !authToken || !this.fromNumber) {
      this.logger.warn('Twilio credentials not configured. SMS and voice services will be disabled (Using N8N).');
      return;
    }

    this.client = new Twilio(accountSid, authToken);
    this.logger.log('Twilio service initialized successfully');
  }

  async sendSMS(to: string, message: string, priority: string = 'normal'): Promise<SMSResult> {
    if (!this.client) {
      return {
        success: false,
        error: 'Twilio service not configured',
      };
    }

    try {
      // Validate phone number format
      const formattedNumber = this.formatPhoneNumber(to);

      const messageOptions: any = {
        body: message,
        from: this.fromNumber,
        to: formattedNumber,
      };

      // Set priority-based options
      if (priority === 'critical' || priority === 'high') {
        messageOptions.statusCallback = this.configService.get<string>('twilio.statusCallbackUrl');
        messageOptions.provideFeedback = true;
      }

      const twilioMessage = await this.client.messages.create(messageOptions);

      this.logger.log(`SMS sent successfully to ${to}, Message ID: ${twilioMessage.sid}`);

      return {
        success: true,
        messageId: twilioMessage.sid,
        status: twilioMessage.status,
      };
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${to}:`, error);

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }

  async sendBulkSMS(recipients: { to: string; message: string }[], priority: string = 'normal'): Promise<SMSResult[]> {
    const results: SMSResult[] = [];

    // Process in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const batchPromises = batch.map(recipient =>
        this.sendSMS(recipient.to, recipient.message, priority)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches for rate limiting
      if (i + batchSize < recipients.length) {
        await this.delay(1000); // 1 second delay
      }
    }

    return results;
  }

  async makeVoiceCall(to: string, message: string, priority: string = 'normal'): Promise<VoiceCallResult> {
    if (!this.client) {
      return {
        success: false,
        error: 'Twilio service not configured',
      };
    }

    try {
      const formattedNumber = this.formatPhoneNumber(to);

      // Create TwiML for the voice message
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice" language="en-US">${this.escapeXml(message)}</Say>
          <Pause length="2"/>
          <Say voice="alice" language="en-US">Press any key to acknowledge this message.</Say>
          <Gather timeout="30" numDigits="1">
            <Say voice="alice" language="en-US">Thank you. This call will now end.</Say>
          </Gather>
        </Response>`;

      const call = await this.client.calls.create({
        twiml,
        to: formattedNumber,
        from: this.fromNumber,
        statusCallback: this.configService.get<string>('twilio.voiceStatusCallbackUrl'),
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      });

      this.logger.log(`Voice call initiated to ${to}, Call ID: ${call.sid}`);

      return {
        success: true,
        callId: call.sid,
        status: call.status,
      };
    } catch (error) {
      this.logger.error(`Failed to make voice call to ${to}:`, error);

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }

  async getMessageStatus(messageId: string): Promise<any> {
    if (!this.client) {
      throw new Error('Twilio service not configured');
    }

    try {
      const message = await this.client.messages(messageId).fetch();

      return {
        sid: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated,
        price: message.price,
        priceUnit: message.priceUnit,
      };
    } catch (error) {
      this.logger.error(`Failed to get message status for ${messageId}:`, error);
      throw error;
    }
  }

  async getCallStatus(callId: string): Promise<any> {
    if (!this.client) {
      throw new Error('Twilio service not configured');
    }

    try {
      const call = await this.client.calls(callId).fetch();

      return {
        sid: call.sid,
        status: call.status,
        direction: call.direction,
        startTime: call.startTime,
        endTime: call.endTime,
        duration: call.duration,
        price: call.price,
        priceUnit: call.priceUnit,
      };
    } catch (error) {
      this.logger.error(`Failed to get call status for ${callId}:`, error);
      throw error;
    }
  }

  async validatePhoneNumber(phoneNumber: string): Promise<{ isValid: boolean; formatted?: string; error?: string }> {
    if (!this.client) {
      return {
        isValid: false,
        error: 'Twilio service not configured',
      };
    }

    try {
      const lookup = await this.client.lookups.v1.phoneNumbers(phoneNumber).fetch();

      return {
        isValid: true,
        formatted: lookup.phoneNumber,
      };
    } catch (error) {
      this.logger.warn(`Phone number validation failed for ${phoneNumber}:`, error.message);

      return {
        isValid: false,
        error: error.message || 'Invalid phone number',
      };
    }
  }

  private formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');

    // Add country code if not present (assuming US/Canada)
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    } else if (digits.startsWith('+')) {
      return phoneNumber;
    }

    return `+${digits}`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Webhook handlers for status updates
  async handleSMSStatusWebhook(body: any): Promise<void> {
    try {
      const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = body;

      this.logger.log(`SMS status update - ID: ${MessageSid}, Status: ${MessageStatus}`);

      if (ErrorCode) {
        this.logger.error(`SMS error - ID: ${MessageSid}, Code: ${ErrorCode}, Message: ${ErrorMessage}`);
      }

      // Here you would typically update the notification status in the database
      // This would be handled by the NotificationService
    } catch (error) {
      this.logger.error('Error processing SMS status webhook:', error);
    }
  }

  async handleVoiceStatusWebhook(body: any): Promise<void> {
    try {
      const { CallSid, CallStatus, Duration } = body;

      this.logger.log(`Voice call status update - ID: ${CallSid}, Status: ${CallStatus}, Duration: ${Duration}`);

      // Here you would typically update the notification status in the database
      // This would be handled by the NotificationService
    } catch (error) {
      this.logger.error('Error processing voice status webhook:', error);
    }
  }

  // Emergency services integration
  async sendEmergencySMS(to: string, location: { latitude: number; longitude: number }, context: string): Promise<SMSResult> {
    const emergencyMessage = `EMERGENCY ALERT: ${context}. Location: https://maps.google.com/?q=${location.latitude},${location.longitude}. Please respond immediately.`;

    return this.sendSMS(to, emergencyMessage, 'critical');
  }

  async makeEmergencyCall(to: string, location: { latitude: number; longitude: number }, context: string): Promise<VoiceCallResult> {
    const emergencyMessage = `Emergency alert. ${context}. The person is located at coordinates ${location.latitude}, ${location.longitude}. Please respond immediately.`;

    return this.makeVoiceCall(to, emergencyMessage, 'critical');
  }
}
