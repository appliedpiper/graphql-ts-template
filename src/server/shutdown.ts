import http from 'http';
import { ApolloServer } from '@apollo/server';
import { closeDatabaseConnection } from '@/datasources/mongo';
import type { createRequestTracker } from './requestTracker';


let shuttingDown = false;

type ShutdownParams = {
  server: ApolloServer;
  httpServer: http.Server;
  requestTracker: ReturnType<typeof createRequestTracker>;
};

export function createShutdownHandler({
  server,
  httpServer,
  requestTracker,
}: ShutdownParams) {
  return async function handleShutdown(signal: NodeJS.Signals) {
    // Prevent multiple shutdown attempts
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n${signal} received. Starting graceful shutdown...`);

    try {
      // 1. Stop accepting new HTTP requests
      console.log('🛑 Closing HTTP server...');
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // 2. FORCE cleanup of any lingering connections
      console.log(`⏳ Draining requests... (${requestTracker.getInFlight()} active)`);
      await requestTracker.waitForDrain(5000);

      // 3. Close DB first (important for real workloads)
      console.log('🛑 Closing MongoDB connection...');
      await closeDatabaseConnection();

      // 4. Stop Apollo
      console.log('🛑 Stopping Apollo Server...');
      // Debug for Lingering Handles
      // console.log((process as any)._getActiveHandles());
      // console.log((process as any)._getActiveRequests());
      await server.stop();

      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('❌ Shutdown error:', err);
      process.exit(1);
    }
  };
}