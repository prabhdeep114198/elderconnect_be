import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface EmailOptions {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private transporter: Transporter | null = null;
    private readonly fromEmail: string;
    private readonly fromName: string;

    constructor(private readonly configService: ConfigService) {
        this.fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL') || 'noreply@elderconnect.com';
        this.fromName = this.configService.get<string>('SMTP_FROM_NAME') || 'ElderConnect';
        this.initializeTransporter();
    }

    private initializeTransporter(): void {
        const smtpHost = this.configService.get<string>('SMTP_HOST');
        const smtpPort = this.configService.get<number>('SMTP_PORT');
        const smtpUser = this.configService.get<string>('SMTP_USER');
        const smtpPassword = this.configService.get<string>('SMTP_PASSWORD');

        if (!smtpHost || !smtpUser || !smtpPassword) {
            this.logger.warn('SMTP configuration is incomplete. Email service will not be available.');
            return;
        }

        try {
            this.transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort || 587,
                secure: smtpPort === 465, // true for 465, false for other ports
                auth: {
                    user: smtpUser,
                    pass: smtpPassword,
                },
            });

            this.logger.log('Email service initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize email service:', error);
        }
    }

    async sendEmail(options: EmailOptions): Promise<boolean> {
        if (!this.transporter) {
            this.logger.error('Email service is not configured. Cannot send email.');
            return false;
        }

        try {
            const mailOptions = {
                from: `"${this.fromName}" <${this.fromEmail}>`,
                to: options.to,
                subject: options.subject,
                text: options.text,
                html: options.html,
            };

            const info = await this.transporter.sendMail(mailOptions);
            this.logger.log(`Email sent successfully to ${options.to}: ${info.messageId}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to send email to ${options.to}:`, error);
            return false;
        }
    }

    async sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
        const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:8081';
        const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4A90E2; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4A90E2; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>We received a request to reset your password for your ElderConnect account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all;">${resetUrl}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ElderConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

        const text = `
      Password Reset Request
      
      Hello,
      
      We received a request to reset your password for your ElderConnect account.
      
      Click the link below to reset your password:
      ${resetUrl}
      
      This link will expire in 1 hour.
      
      If you didn't request a password reset, please ignore this email or contact support if you have concerns.
      
      © ${new Date().getFullYear()} ElderConnect. All rights reserved.
    `;

        return this.sendEmail({
            to: email,
            subject: 'Reset Your ElderConnect Password',
            text,
            html,
        });
    }

    async sendWelcomeEmail(email: string, firstName: string): Promise<boolean> {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4A90E2; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ElderConnect!</h1>
          </div>
          <div class="content">
            <p>Hello ${firstName},</p>
            <p>Welcome to ElderConnect! We're excited to have you join our community.</p>
            <p>Your account has been successfully created. You can now start using all the features of ElderConnect.</p>
            <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ElderConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

        return this.sendEmail({
            to: email,
            subject: 'Welcome to ElderConnect',
            html,
        });
    }
}
