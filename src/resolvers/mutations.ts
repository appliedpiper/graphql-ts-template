import { ObjectId } from "mongodb";
import { GraphQLError } from "graphql";
import type { MutationResolvers } from "@/__generated__/types";
import { generateUserDocs, generateOrderDocs } from "@/seed/userDocs";

export const mutationResolvers: MutationResolvers = {
  // Import some example data into the users and orders collections.
  //
  // DESTRUCTIVE: deletes every user and order before inserting. Requires the
  // admin role (see the policy map in resolvers.ts) and additionally refuses to
  // run in production, because no amount of authorization makes wiping the
  // production database from a GraphQL mutation a good idea. Local/dev only.
  async seedDatabase(_, args, { dataSources}) {
    if (process.env.NODE_ENV === 'production') {
      throw new GraphQLError(
        'seedDatabase is disabled in production.',
        { extensions: { code: 'FORBIDDEN', http: { status: 403 } } },
      );
    }

    // Extract User and Order Counts
    // This is done without destructing in case the input is not defined
    const userCount = args?.input?.userCount ?? 5;
    const orderCount = args?.input?.orderCount ?? 10;
    
    // Establish connection with MongoDB Collections
    const { users, orders } = dataSources.businessAPI;

    // Remove Old Data from collections
    await users.deleteMany({});
    await orders.deleteMany({});

    // Insert Users
    const userDocs = generateUserDocs(userCount);
    const userResult = await users.insertMany(userDocs);

    // Insert Orders
    const orderDocs = generateOrderDocs(userDocs, orderCount);
    const orderResult = await orders.insertMany(orderDocs);

    // Return Insertion Results
    return {
      usersInserted: userResult.insertedCount,
      ordersInserted: orderResult.insertedCount,
    }
  },
  
  // Add a new user to the database
  async addUser(_, { input }, { dataSources }) {
    const { users } = dataSources.businessAPI;
    const newUser = {
      _id: new ObjectId(),
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
    };
    const result = await users.insertOne(newUser);
    return {
      ...newUser,
      _id: result.insertedId,
    };
  }
  
};