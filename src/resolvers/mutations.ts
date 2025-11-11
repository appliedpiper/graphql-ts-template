import type { MutationResolvers } from "@/__generated__/types";
import { generateUserDocs, generateOrderDocs } from "@/seed/userDocs";

export const mutationResolvers: MutationResolvers = {
  // Import some example data into the users and orders collections
  async seedDatabase(_, args, { dataSources}) {
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
  }
};