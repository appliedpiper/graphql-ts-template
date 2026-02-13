// Mongo Imports
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import type { MongoCollections } from '@/datasources/mongo';

import type { User, Order, SeedResult } from '@/__generated__/types';
import { generateUserDocs, generateOrderDocs } from '@/seed/userDocs';
import { queryResolvers } from '@/resolvers/queries';
import { mutationResolvers } from '@/resolvers/mutations';
import type { Context } from '@/context/context'; 
import { callResolver } from '@/__tests__/helpers/callResolver';


// ////////////////////////////////////////////
//      In-Memory MongoDB Setup
// ////////////////////////////////////////////

let mongoServer: MongoMemoryServer;
let client: MongoClient;
let collections: MongoCollections;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  client = new MongoClient(mongoServer.getUri());
  await client.connect();

  const db = client.db('testdb');

  collections = {
    users: db.collection<User>('users'),
    orders: db.collection<Order>('orders'),
  };
});

afterAll(async () => {
  if (client) await client.close();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await collections.users.deleteMany({});
  await collections.orders.deleteMany({});
});

// ////////////////////////////////////////////
//      Mock Context
// ////////////////////////////////////////////
const createTestContext = (): Context => ({
  dataSources: { businessAPI: collections },
  cache: {
    get: async () => undefined,
    set: async () => {},
    delete: async () => {},
  },
});

// ////////////////////////////////////////////
//      Generating User & Order Data
// ////////////////////////////////////////////
describe('Generating User and Order Data', () => {
  it('Inserts and Finds Users', async () => {
    const users = generateUserDocs(5);
    await collections.users.insertMany(users);

    const foundUsers = await collections.users.find({}).toArray();
    expect(foundUsers.length).toBe(5);
    expect(foundUsers[0].lastName).toBe('1'); // check first user lastName
    expect(foundUsers[4].email).toBe('user5@example.com'); // check last user email
  });

  it('Inserts and retrieves generated orders for users', async () => {
    const users = generateUserDocs(3);
    await collections.users.insertMany(users);

    const orders = generateOrderDocs(users, 10); // generate 10 random orders
    await collections.orders.insertMany(orders);

    const allOrders = await collections.orders.find({}).toArray();
    expect(allOrders.length).toBe(10);

    // Verify each order's userId exists in users
    allOrders.forEach(order => {
      const matchingUser = users.find(u => u._id === order.userId);
      expect(matchingUser).toBeDefined();
      expect(typeof order.total).toBe('number');
    });
  });

  it('Returns an empty array if no orders exist for a user', async () => {
    const orders = await collections.orders.find({ userId: 'nonexistent' }).toArray();
    expect(orders).toEqual([]);
  });
});

// ////////////////////////////////////////////
//       Query Resolvers
// ////////////////////////////////////////////
describe('Query Resolvers', () => {
  it('Retrieves all available users', async () => {
    const users = generateUserDocs(100);
    await collections.users.insertMany(users);

    const context = createTestContext();
    const wrappedResults = await callResolver(queryResolvers.users, undefined, undefined, context);
    const results = await Promise.all(wrappedResults);

    expect(results.length).toBe(100);
    expect(results[0].lastName).toBe('1');
    expect(results[99].lastName).toBe('100');
  });

  it('Retrieves a single user by lastName', async () => {
    const users = generateUserDocs(10);
    await collections.users.insertMany(users);

    const context = createTestContext();
    const wrappedResult = await callResolver(queryResolvers.userByName, undefined, { name: '5' }, context);
    const result = await Promise.resolve(wrappedResult); // unwrap single ResolverTypeWrapper

    expect(result).toBeDefined();
    expect(result?.lastName).toBe('5');
  });

  it('Returns null is lastname is undefined', async () => {
    const context = createTestContext();
    const wrappedResult = await callResolver(queryResolvers.userByName, undefined, { name: undefined }, context);
    const result = await Promise.resolve(wrappedResult); // unwrap single ResolverTypeWrapper

    expect(result).toBeNull();
  });

  it('Retrieves a single user by ID', async () => {
    const users = generateUserDocs(10);
    await collections.users.insertMany(users);
    const context = createTestContext();
    const userId = users[3]._id;

    const wrappedResult = await callResolver(queryResolvers.userById, undefined, { id: userId }, context);
    const result = await Promise.resolve(wrappedResult);

    expect(result).toBeDefined();
    expect(result?._id).toBe(userId);
  });

  it('Returns null if user ID is undefined', async () => {
    const context = createTestContext();
    const wrappedResult = await callResolver(queryResolvers.userById, undefined, { id: undefined }, context);
    const result = await Promise.resolve(wrappedResult);

    expect(result).toBeNull();
  });

  it('Retrieves all orders', async () => {
    const users = generateUserDocs(5);
    await collections.users.insertMany(users);
    
    const orders = generateOrderDocs(users, 50);
    await collections.orders.insertMany(orders);
    
    const context = createTestContext();
    const wrappedResults = await callResolver(queryResolvers.orders, undefined, undefined, context);
    const results = await Promise.all(wrappedResults);

    expect(results.length).toBe(50);
    results.forEach(order => {
      expect(order.userId).toBeDefined();
      expect(typeof order.total).toBe('number');
    });
  });

  it('Retrieves a single order by ID', async () => {
    const users = generateUserDocs(3);
    await collections.users.insertMany(users);
    
    const orders = generateOrderDocs(users, 10);
    await collections.orders.insertMany(orders);
    
    const context = createTestContext();
    const orderId = orders[5]._id;
    const wrappedResult = await callResolver(queryResolvers.order, undefined, { id: orderId }, context);
    const result = await Promise.resolve(wrappedResult);

    expect(result).toBeDefined();
    expect(result?._id).toBe(orderId);
  });

  it('Returns null if order id is undefined', async () => {
    const context = createTestContext();
    const wrappedResult = await callResolver(queryResolvers.order, undefined, { id: undefined }, context);
    const result = await Promise.resolve(wrappedResult);

    expect(result).toBeNull();
  });

});

// ////////////////////////////////////////////
//              Mutations
// ////////////////////////////////////////////
describe('Mutation Resolvers - seedDatabase', () => {
  it('Seed 5 users and 10 orders by default', async () => {
    const context = createTestContext();
        
    const wrappedResult = await callResolver(mutationResolvers.seedDatabase, undefined, undefined, context);
    const result = await Promise.resolve(wrappedResult) as SeedResult;

    expect(result.usersInserted).toBe(5);
    expect(result.ordersInserted).toBe(10);

    const users = await context.dataSources.businessAPI.users.find({}).toArray();
    const orders = await context.dataSources.businessAPI.orders.find({}).toArray();

    expect(users.length).toBe(5);
    expect(orders.length).toBe(10);
  });

  it('Seed users and orders based on specified input', async () => {
    const context = createTestContext();
        
    const wrappedResult = await callResolver(mutationResolvers.seedDatabase, undefined, {input: {userCount: 20, orderCount: 50}}, context);
    const result = await Promise.resolve(wrappedResult) as SeedResult;

    expect(result.usersInserted).toBe(20);
    expect(result.ordersInserted).toBe(50);

    const users = await context.dataSources.businessAPI.users.find({}).toArray();
    const orders = await context.dataSources.businessAPI.orders.find({}).toArray();

    expect(users.length).toBe(20);
    expect(orders.length).toBe(50);
  });
});

describe('Helpers - callResolver', () => {
  const context = {} as Context;

  it('should throw an error when resolver is undefined', async () => {
    await expect(callResolver(undefined, {}, {}, context)).rejects.toThrow('Resolver is undefined');
  });

  it('should throw an error when resolver is undefined with parent/args omitted', async () => {
    await expect(callResolver(undefined, undefined, undefined, context)).rejects.toThrow('Resolver is undefined');
  });
});