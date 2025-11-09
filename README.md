# Elder Connect API

A comprehensive NestJS backend for Elder Connect, an IoT-enabled elderly care platform with cloud microservices architecture.

## 🏗️ Architecture Overview

Elder Connect is built as a microservices architecture with the following components:

### Core Services
- **Authentication Service** - JWT + mTLS authentication with RBAC
- **Profile Service** - User profiles and medication management
- **Device Service** - IoT device management and telemetry ingestion
- **Media Service** - File uploads with S3 integration
- **Notification Service** - Multi-channel alerts (SMS, Push, Voice, Email)

### Infrastructure
- **API Gateway** - Unified entry point with rate limiting and CORS
- **Multiple PostgreSQL Databases** - Separated by domain
- **Kafka Stream Broker** - Real-time telemetry and event streaming
- **Redis Cache** - Session management and caching
- **AWS S3** - Media file storage with presigned URLs

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Docker and Docker Compose
- PostgreSQL 14+
- Redis 6+
- Kafka 2.8+

### Installation

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd elder-connect-api
npm install
```

2. **Environment Configuration**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start infrastructure services**
```bash
docker-compose up -d postgres redis kafka
```

4. **Run database migrations**
```bash
npm run migration:run
```

5. **Start the application**
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## 📊 Database Schema

### Multiple Database Architecture

#### elder_auth_db
- `users` - User authentication and basic info
- `devices` - Registered IoT devices

#### elder_profile_db  
- `user_profiles` - Detailed user profiles
- `medications` - Medication information
- `medication_logs` - Medication intake tracking

#### elder_vitals_db
- `telemetry_data` - Raw device telemetry
- `vitals` - Processed health metrics
- `sos_alerts` - Emergency alerts

#### elder_media_db
- `media_files` - File metadata and storage info

#### elder_audit_db
- `audit_logs` - System audit trail
- `notifications` - Notification history
- `notification_templates` - Message templates

## 🔐 Authentication & Authorization

### JWT Authentication
- Access tokens (15 minutes)
- Refresh tokens (7 days)
- Device-specific tokens for IoT devices

### Role-Based Access Control (RBAC)
- **Elder** - Basic user access
- **Caregiver** - Extended access to assigned elders
- **Admin** - Full system access

### mTLS for Device Authentication
- Certificate-based device authentication
- Device fingerprinting and validation

## 📡 API Endpoints

### Authentication
```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/devices/register
```

### User Profiles
```
GET    /api/v1/users/:id/profile
POST   /api/v1/users/:id/profile
PUT    /api/v1/users/:id/profile
GET    /api/v1/users/:id/medications
POST   /api/v1/users/:id/medications
```

### Device & Telemetry
```
POST   /api/v1/devices/:id/telemetry
POST   /api/v1/devices/:id/sos
POST   /api/v1/users/:id/vitals
GET    /api/v1/devices/:id/status
```

### Media Management
```
POST   /api/v1/media/upload
POST   /api/v1/media/upload/presigned
GET    /api/v1/media/:fileId
DELETE /api/v1/media/:fileId
```

### Notifications
```
POST   /api/v1/notifications
GET    /api/v1/notifications
POST   /api/v1/notifications/emergency-alert
POST   /api/v1/notifications/medication-reminder
```

## 🔄 Real-time Features

### Kafka Integration
- **Telemetry Stream** - Real-time health data processing
- **Alert Queue** - Priority-based emergency notifications
- **Notification Events** - In-app notification delivery

### WebSocket Support
- Real-time dashboard updates
- Live health monitoring
- Instant emergency alerts

## 📱 Notification System

### Multi-Channel Support
- **SMS** - Twilio integration with emergency calling
- **Push Notifications** - Firebase Cloud Messaging
- **Voice Calls** - Automated emergency calls
- **Email** - SMTP integration
- **In-App** - Real-time WebSocket notifications

### Template System
- Customizable message templates
- Multi-language support
- Variable substitution
- A/B testing capabilities

## 🏥 Health Monitoring

### IoT Device Integration
- Wearable devices (heart rate, steps, sleep)
- Environmental sensors (temperature, humidity)
- Emergency devices (panic buttons, fall detection)
- Mobile app integration

### Anomaly Detection
- Real-time health metric analysis
- Configurable alert thresholds
- Machine learning integration ready
- Trend analysis and reporting

## 📈 Monitoring & Observability

### Health Checks
```
GET /health              # Basic health status
GET /health/detailed     # Comprehensive system status
GET /health/metrics      # Application metrics
```

### Prometheus Metrics
- HTTP request metrics
- Database connection pools
- Business metrics (users, alerts, notifications)
- System resource usage

### Audit Logging
- All API calls logged
- User action tracking
- Security event monitoring
- Compliance reporting

## 🔧 Configuration

### Environment Variables

```bash
# Application
NODE_ENV=development
PORT=3000
API_PREFIX=api

# Databases
DB_AUTH_HOST=localhost
DB_AUTH_PORT=5432
DB_AUTH_NAME=elder_auth_db
DB_AUTH_USER=postgres
DB_AUTH_PASS=password

# Similar for profile, vitals, media, audit databases

# External Services
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# AWS S3
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=elder-connect-media

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=elder-connect-api

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📦 Deployment

### Docker Deployment
```bash
# Build image
docker build -t elder-connect-api .

# Run with Docker Compose
docker-compose up -d
```

### Production Considerations
- Use environment-specific configurations
- Enable SSL/TLS termination
- Configure proper logging levels
- Set up monitoring and alerting
- Implement backup strategies

## 🔒 Security Features

### Data Protection
- Encryption at rest and in transit
- PII data anonymization
- GDPR compliance ready
- Audit trail for all data access

### API Security
- Rate limiting (multiple tiers)
- Request validation and sanitization
- CORS configuration
- Security headers (Helmet.js)

### Authentication Security
- Password hashing (bcrypt)
- Account lockout after failed attempts
- JWT token rotation
- Device fingerprinting

## 📚 API Documentation

Interactive API documentation is available at:
- Development: `http://localhost:3000/api/docs`
- Swagger/OpenAPI 3.0 specification
- Authentication testing built-in
- Request/response examples

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation
- Review the troubleshooting guide

## 🔄 Version History

### v1.0.0 (Current)
- Initial release with full microservices architecture
- Complete authentication and authorization system
- IoT device management and telemetry processing
- Multi-channel notification system
- Media management with S3 integration
- Comprehensive monitoring and health checks
# ElderConnect_BE
