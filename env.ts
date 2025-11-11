import * as dotenv from 'dotenv';
import { z } from "zod";

// Specify the .env file to generate TypeScript types for your environment variables
dotenv.config({ path: "./.env" });

// Declare the types for your ENV variables here:
const ENVSchema = z.object({
  GQL_PORT: z.string(),
  MONGO_USERNAME: z.string(),
  MONGO_PASSWORD: z.string(),
  MONGO_URI: z.string(),
  DB_NAME: z.string(),
});

export default ENVSchema.parse(process.env);