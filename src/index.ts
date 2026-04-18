import env from '@/lib/env';

import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

// import { typeDefs } from './typeDefs';
import { typeDefs } from '@/schema/typeDefs';
import { resolvers } from '@resolvers/resolvers';
import { createContext } from '@/context/context';
import { closeDatabaseConnection } from './datasources/mongo';

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

const port = env.GQL_PORT ? parseInt(env.GQL_PORT, 10) : 4000;

async function startApolloServer() {
  const { url } = await startStandaloneServer(server, {
    listen: { port },
    context: async () => createContext({ cache: server.cache }),
  });

  console.log(`
    🚀 Server is Running!
    📭 Query at ${url}
  `);

  // Graceful Shutdown Handling
  const handleShutdown = async (signal: NodeJS.Signals) => {
    console.log(`\n${signal} received. Cleaning up...`);
      
    try {
      // Close MongoDB Connection
      console.log("🛑 Closing MongoDB connection...");
      await closeDatabaseConnection();
      
      // Stop Apollo Server
      console.log("🛑 Stopping Apollo Server...");
      console.log(process.getActiveResourcesInfo());
      await server.stop();

      console.log("✅ Graceful shutdown complete.");
      process.exit(0);
      
    } catch (err) {
      console.error("❌ Error during shutdown:", err);
      process.exit(1);
    }
  };

  // Force exit on signals to prevent "Force killing" message
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

startApolloServer().catch((err) => {
  console.error('Failed to Start Server: ', err);
  process.exit(1);
});