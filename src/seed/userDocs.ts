import { ObjectId } from "mongodb";
import type { Order, User } from "src/__generated__/types";


// /////////////////////////////////////////////////
//                User Seed Data                  //
// /////////////////////////////////////////////////
export function generateUserDocs(numUsers: number): User[] {
  return Array.from({ length: numUsers }).map((_, i) => {
    return {
      _id: new ObjectId().toHexString(),
      firstName: 'User',
      lastName: `${i+1}`,
      email: `user${i+1}@example.com`,
    }
  })
}

// /////////////////////////////////////////////////
//                Order Seed Data                  //
// /////////////////////////////////////////////////
export function generateOrderDocs(userDocs: User[], numOrders: number): Order[] { 
  return Array.from({ length: numOrders }).map(() => {
    const user = userDocs[Math.floor(Math.random() * userDocs.length)];
    return {
      _id: new ObjectId().toHexString(),
      userId: user._id,
      total: parseFloat((Math.random() * 100).toFixed(2)),
      createdAt: new Date(),
    }
  })
}