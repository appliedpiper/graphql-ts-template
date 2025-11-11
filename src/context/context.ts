import type { KeyValueCache } from "@apollo/utils.keyvaluecache";  // Apollo cache type
import { initMongo, MongoCollections } from "@/datasources/mongo";

// Define the DataSource at @/datasource 
// Then Add DataSources to the context
export type DataSources = {
  businessAPI: MongoCollections;
  // Add Future data sources here:
  // mariaDB: MariaDbDataSource;
};

// Define the Context with dataSources and server cache
// Store the result of your queries in the cache to improve server performance
export type Context = {
  dataSources: DataSources;
  cache: KeyValueCache<string>;
};

export async function createContext({ cache }: {cache: KeyValueCache<string>}): Promise<Context> {
  const businessCollections = await initMongo();
  // const mariaDB = await initMariaDb();

  return {
    dataSources: {
      businessAPI: businessCollections,
      // mariaDB,
    },
    cache,
  };
}

