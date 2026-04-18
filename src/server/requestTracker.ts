// Request tracker for graceful shutdown
// Tracks in-flight requests and provides a way to wait for them to finish during shutdown
export function createRequestTracker() {
  let inFlight = 0;

  return {
    // Express middleware to track requests
    middleware: () => {
      return (_req: any, _res: any, next: any) => {
        inFlight++;

        const done = () => {
          inFlight--;
        };

        _res.on('finish', done);
        _res.on('close', done);

        next();
      };
    },

    getInFlight: () => inFlight,

    // Waits for all in-flight requests to finish, with a timeout to prevent hanging
    waitForDrain: async (timeoutMs = 15000) => {
      const start = Date.now();

      while (inFlight > 0) {
        if (Date.now() - start > timeoutMs) {
          throw new Error(`Request drain timeout: ${inFlight} requests still active`);
        }

        await new Promise((r) => setTimeout(r, 50));
      }
    },
  };
}