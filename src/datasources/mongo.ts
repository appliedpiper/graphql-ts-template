import env from '../../env';
import { MongoClient, Collection, Db } from "mongodb";
import type { User, Order } from "@/__generated__/types";


// /////////////////////////////////////////////////
//            MongoDB Connection Info             //
// /////////////////////////////////////////////////

const MONGO_URI = env.MONGO_URI ?? 'mongodb://localhost:27017';
const DB_NAME = env.DB_NAME ?? 'graphql_template';

let mongoClient: MongoClient | null = null;

// /////////////////////////////////////////////////
//  Defining Data Sources - Adding to Context     //
// /////////////////////////////////////////////////
export type MongoCollections = {
  users: Collection<User>;
  orders: Collection<Order>;
};

// /////////////////////////////////////////////////
//              Establish Connections             //
// /////////////////////////////////////////////////
export async function initMongo(): Promise<MongoCollections> {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    console.log(`✅ Connected to MongoDB: ${DB_NAME}`)
  }

  const db: Db = mongoClient.db(DB_NAME);

  return {
    users: db.collection<User>('users'),
    orders: db.collection<Order>('orders'),
  };
}

// /////////////////////////////////////////////////
//              Close Connection                  //
// /////////////////////////////////////////////////
export async function closeDatabaseConnection() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    console.log("🧹 MongoDB connection closed.");
  }
}