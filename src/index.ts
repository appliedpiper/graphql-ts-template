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

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const requestTracker = createRequestTracker();

  // Start Apollo Server
  await server.start();

  // Apply Express Middleware for Apollo Server
  app.use(requestTracker.middleware());

  // GraphQL Endpoint
  app.use(
    '/graphql',
    express.json(),
    expressMiddleware(server, {
      context: async () => createContext({ cache: server.cache }),
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