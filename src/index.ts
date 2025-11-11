import env from '../env';

import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

// import { typeDefs } from './typeDefs';
import { typeDefs } from '@/schema/typeDefs';
import { resolvers } from '@resolvers/resolvers';
import { createContext } from '@/context/context';

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

}

startApolloServer().catch((err) => {
  console.error('Failed to Start Server: ', err);
  process.exit(1);
});