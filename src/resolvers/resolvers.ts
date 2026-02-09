import type { Resolvers } from "@/__generated__/types";
import { mutationResolvers } from "@resolvers/mutations";
import { queryResolvers } from "@resolvers/queries";
import { userResolvers } from "@resolvers/users";
import { DateScalar } from "@scalars/DateScalar";
import { Email } from "@scalars/EmailScalar";

// Combined Export for all Resolvers
export const resolvers: Resolvers = {
  Email,
  Date: DateScalar,
  Query: queryResolvers,
  Mutation: mutationResolvers,
  User: userResolvers
}