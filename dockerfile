# Stage 1: Install dependencies
FROM node:18-alpine AS deps
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy dependency manifests
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install

# Stage 2: Build the application
FROM node:18-alpine AS builder
WORKDIR /app

# Install pnpm globally in builder stage
RUN npm install -g pnpm

# Copy dependencies from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the application code
COPY . .

# Build the Next.js app
RUN pnpm run build

# **Diagnostic Step: List Directory Contents**
RUN echo "Contents of /app in builder stage:" && ls -la /app/.next

# Stage 3: Serve the application
FROM node:18-alpine AS runner
WORKDIR /app

# Install pnpm globally in runner stage
RUN npm install -g pnpm

# Copy dependency manifests
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files and public assets from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# **Diagnostic Step: List Directory Contents in runner stage**
RUN echo "Contents of /app in runner stage:" && ls -la /app && \
    echo "Contents of /app/.next in runner stage:" && ls -la /app/.next

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the app
CMD ["pnpm", "start"]
