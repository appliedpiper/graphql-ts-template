import * as dotenvFlow from 'dotenv-flow';
import { z } from "zod";

// Specify the .env file to generate TypeScript types for your environment variables
// dotenv.config({ path: "./.env.local" });

// Updated to use dotenv-flow to support multiple environments (e.g., .env.development, .env.production, etc.)
dotenvFlow.config();


// Declare the types for your ENV variables here:
const ENVSchema = z.object({
  GQL_PORT: z.string(),
  PUBLIC_URL: z.string(),
  MONGO_URI: z.string(),
  DB_NAME: z.string(),

  // Verifies Clerk session tokens in the Apollo context. Required, and parsed
  // at import — the server refuses to boot without it rather than starting with
  // verification silently disabled. Copy the value from frontend/.env.local;
  // both sides must point at the same Clerk instance.
  CLERK_SECRET_KEY: z.string().min(1),
});

export default ENVSchema.parse(process.env);