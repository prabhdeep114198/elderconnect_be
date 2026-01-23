import * as Joi from 'joi';

export const validationSchema = Joi.object({
    // Application
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    PORT: Joi.number().default(3000),
    API_VERSION: Joi.string().default('v1'),

    // Database - Auth
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().default(5432),
    DB_USERNAME: Joi.string().required(),
    DB_PASSWORD: Joi.string().required(),
    AUTH_DB_NAME: Joi.string().required(),
    PROFILE_DB_NAME: Joi.string().required(),
    VITALS_DB_NAME: Joi.string().required(),
    MEDIA_DB_NAME: Joi.string().required(),
    AUDIT_DB_NAME: Joi.string().required(),

    // Redis
    REDIS_HOST: Joi.string().required(),
    REDIS_PORT: Joi.number().default(6379),
    REDIS_PASSWORD: Joi.string().allow('').optional(),

    // Kafka
    KAFKA_BROKERS: Joi.string().required(),
    KAFKA_CLIENT_ID: Joi.string().required(),
    KAFKA_GROUP_ID: Joi.string().required(),

    // JWT - CRITICAL: Must be provided
    JWT_SECRET: Joi.string()
        .min(32)
        .required()
        .messages({
            'string.min': 'JWT_SECRET must be at least 32 characters long',
            'any.required': 'JWT_SECRET is required and must be set in environment variables',
        }),
    JWT_EXPIRES_IN: Joi.string().default('24h'),

    // AWS S3
    AWS_ACCESS_KEY_ID: Joi.string().required(),
    AWS_SECRET_ACCESS_KEY: Joi.string().required(),
    AWS_REGION: Joi.string().default('us-east-1'),
    S3_BUCKET_NAME: Joi.string().required(),

    // Twilio
    TWILIO_ACCOUNT_SID: Joi.string().optional(),
    TWILIO_AUTH_TOKEN: Joi.string().optional(),
    TWILIO_PHONE_NUMBER: Joi.string().optional(),

    // Firebase
    FIREBASE_PROJECT_ID: Joi.string().optional(),
    FIREBASE_PRIVATE_KEY: Joi.string().optional(),
    FIREBASE_CLIENT_EMAIL: Joi.string().email().optional(),

    // N8N
    N8N_WEBHOOK_URL: Joi.string().uri().optional(),
    N8N_API_KEY: Joi.string().optional(),

    // Razorpay
    RAZORPAY_KEY_ID: Joi.string().optional(),
    RAZORPAY_KEY_SECRET: Joi.string().optional(),

    // Flagsmith
    FLAGSMITH_ENVIRONMENT_KEY: Joi.string().optional(),

    // Email Configuration (for password reset)
    SMTP_HOST: Joi.string().optional(),
    SMTP_PORT: Joi.number().default(587),
    SMTP_USER: Joi.string().optional(),
    SMTP_PASSWORD: Joi.string().optional(),
    SMTP_FROM_EMAIL: Joi.string().email().optional(),
    SMTP_FROM_NAME: Joi.string().default('ElderConnect'),

    // Rate Limiting
    THROTTLE_TTL: Joi.number().default(60),
    THROTTLE_LIMIT: Joi.number().default(100),

    // File Upload
    MAX_FILE_SIZE: Joi.number().default(10485760),
    ALLOWED_FILE_TYPES: Joi.string().default('image/jpeg,image/png,image/gif,video/mp4,audio/mpeg'),

    // OpenTelemetry
    OTEL_SERVICE_NAME: Joi.string().default('elder-connect-api'),
    OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().optional(),

    // Frontend URL (for password reset links)
    FRONTEND_URL: Joi.string().uri().default('http://localhost:8081'),
});

/**
 * Validates environment variables at application startup
 * Throws an error if validation fails
 */
export function validateEnvironment(config: Record<string, unknown>) {
    const { error, value } = validationSchema.validate(config, {
        allowUnknown: true,
        abortEarly: false,
    });

    if (error) {
        const errorMessages = error.details.map((detail) => detail.message).join('\n');
        throw new Error(`Environment validation failed:\n${errorMessages}`);
    }

    return value;
}
