# ========================
# Build Stage
# ========================
FROM node:22-alpine AS gql-build

# Set the working directory
WORKDIR /app

# Install pnpm package manager
RUN npm install -g pnpm@10.12.4
# Install OS packages needed for ts-node-dev and native builds
RUN apk add --no-cache python3 make g++

# Copy the package files
COPY package.json pnpm-lock.yaml* ./

# Install @types where Typescript can find them
RUN pnpm install -D @types/node @types/jest --shamefully-hoist
# Install Dependencies 
RUN pnpm install --frozen-lockfile


# Copy the Source Code
COPY . .

# Build TypeScript
RUN pnpm run build

# ========================
# Production
# ========================
FROM node:22-alpine AS gql-prod

# Set the working directory
WORKDIR /app

# Copy compiled JS and package files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml* ./

# Install production-only dependencies
RUN npm install -g pnpm@10.12.4
RUN pnpm install --prod --frozen-lockfile

# EXPOSE PORT
EXPOSE 4000

# Run the GraphQL Server in Prod
CMD [ "node", "./dist/index.js" ]

# ========================
# Development
# ========================
FROM gql-build AS gql-dev

WORKDIR /app

# Don't forget to set your bind mount in your compose file for hot reload
EXPOSE 4000
CMD ["pnpm", "dev"]
