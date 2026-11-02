import env from '@/lib/env';

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
// import { startStandaloneServer } from '@apollo/server/standalone';
import express from 'express';
import http from 'http';

// import { typeDefs } from './typeDefs';
import { typeDefs } from '@/schema/typeDefs';
import { resolvers } from '@resolvers/resolvers';
import { createContext } from '@/context/context';
import { createSessionVerifier } from '@/lib/auth/verifySession';
import { createShutdownHandler } from '@/server/shutdown';
import { createRequestTracker } from '@/server/requestTracker';

/**
 * Server runtime entry point
 * Initializes the Apollo Server with the defined typeDefs, resolvers, and context.
 * DO NOT export types from this file.
 */

// Define Server Components
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const publicUrl = env.PUBLIC_URL || 'http://localhost';
const port = env.GQL_PORT ? parseInt(env.GQL_PORT, 10) : 4000;

// Built once at startup so the Clerk SDK's JWKS cache is shared across
// requests rather than refetched per request.
const verifySession = createSessionVerifier(env.CLERK_SECRET_KEY);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const requestTracker = createRequestTracker();

  // Start Apollo Server
  await server.start();

  // Apply Express Middleware for Apollo Server
  app.use(requestTracker.middleware());

  // Base URL Redirect
  app.get('/', (req, res) => {
    res.redirect('/graphql');
  });

  // GraphQL Endpoint
  app.use(
    '/graphql',
    express.json(),
    expressMiddleware(server, {
      // `req` is what carries the Authorization header — the context reads the
      // bearer token off it and verifies the caller. Dropping it here would
      // silently make every request anonymous.
      context: async ({ req }) =>
        createContext({ cache: server.cache, req, verifySession }),
    })
  );

  await new Promise<void>((resolve) => {
    httpServer.listen(port, resolve);
  });

  console.log(`
    🚀 Server is Running!
    📭 Query at ${publicUrl}:${port}/graphql
  `);

  // Attach shutdown handler
  const shutdown = createShutdownHandler({
    server,
    httpServer,
    requestTracker,
  });

  // Force exit on signals to prevent "Force killing" message
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error('Failed to Start Server: ', err);
  process.exit(1);
});