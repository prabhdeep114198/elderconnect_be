# Stage 1: Build
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies)
# We use --ignore-scripts to prevent husky from trying to install in Docker
RUN npm install --ignore-scripts

# Copy source code and configuration
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
# --ignore-scripts is crucial here to avoid the husky "prepare" script error
RUN npm ci --only=production --ignore-scripts

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Railway uses the PORT environment variable
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
