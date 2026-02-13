import type { QueryResolvers } from "@/__generated__/types";
import type { Context } from '@/context/context';

// ////////////////////////////////////////////////////////
//  Write GraphQL Queries against your DataSources here
// ////////////////////////////////////////////////////////
export const queryResolvers: QueryResolvers<Context> = {
  // Get All Available Users
  async users (_, __, { dataSources }) {
    const { users } = dataSources.businessAPI;
    return await users.find({}).toArray();
  },

  // Get a single user by ID
  async userById(_, { id }, { dataSources }) {
    const { users } = dataSources.businessAPI;
    if (!id) return null;
    return await users.findOne({_id: id});
  },

  // Get a single user by name
  async userByName(_, { name }, { dataSources }) {
    const { users } = dataSources.businessAPI;
    if (!name) return null;
    return await users.findOne({lastName: name});
  },

  // Get All Orders
  async orders(_, __, { dataSources}) {
    const { orders } = dataSources.businessAPI;
    return await orders.find({}).toArray();
  },

  // Get Order By ID
  async order(_, {id}, {dataSources}){
    const { orders } = dataSources.businessAPI;
    if (!id) return null;
    return await orders.findOne({_id: id});
  }
};