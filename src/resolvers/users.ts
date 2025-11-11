import type { UserResolvers } from "@/__generated__/types";

// Nested relationship to return the array of orders for a given user
export const userResolvers: UserResolvers = {
  async orders(parent, __, { dataSources }) {
    const { orders } = dataSources.businessAPI;
    return await orders.find({ userId: parent._id }).toArray();
  }
};