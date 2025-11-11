# GraphQL TypeScript Template

A standalone GraphQL server template built with **TypeScript**, **MongoDB**, and **Apollo Server**, designed for rapid API development. GraphQL Server can be deployed in a local or containerized environment.   

--- 
## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Configure Environment Variables](#configure-environment-variables)
- [Seeding the Database](#seeding-the-database)
- [Customizing the Schema](#customizing-the-schema)
- [Testing](#testing)
- [Docker](#docker)
- [Contributing](#contributing)
- [License](#license)


## Features
- TypeScript-first GraphQL API
- MongoDB as primary data source
- Modular `.graphql` schema files
- Apollo Server context with multiple datasources support
- Custom Scalars (`Date`, `Email`)
- GraphQL Codegen for TypeScript types
- Seed data mutations for users and orders
- Jest tests for resolvers and database operations
- Containerized GraphQL Production and Development builds

---

## Prerequisites

- Node.js >= 18
- pnpm >= 10
- MongoDB instance (local or cloud)

---

## Getting Started

Follow these steps to set up the project locally:

1. **Install pnpm globally** (if not already installed):

```bash
npm install -g pnpm
```

2. **Clone the Repository**
```bash
git clone https://github.com/appliedpiper/graphql-ts-template.git
cd graphql-ts-template
```

3. **Install the Dependencies**
```bash
pnpm install
```

4. **Configure Environment Variables**
Update the .env file in the project root to specify the MongoDB URI, Database Name and GraphQL Port
```
DOTENV_CONFIG_QUIET=true
GQL_PORT=4000
#Replace the MONGO_URI with your MongoDB connection string
MONGO_URI=mongodb://localhost:27017
DB_NAME=gql_template
```

5. **Start the Development Server**
```bash
pnpm dev
```
Your server should now be running at http://localhost:4000/graphql (or the port you specified).


6. **Seeding the Database**
Use the GraphQL mutation seedDatabase to populate user and orders collections.  Defaults: userCount = 5, orderCount = 10.
```
mutation SeedDatabase($input: SeedInput) {
  seedDatabase(input: $input) {
    ordersInserted
    usersInserted
  }
}
```

Define the SeedInput as part of the gql variables
```
  "variables": {
    "input": {
      "orderCount": 10,
      "userCount": 20
    }
  }
```

7. **Execute GQL Queries**
From http://localhost:4000/graphql Build a query such as
```
query USER_QUERY {
  user(name: "1") {
    firstName
    lastName
    email
    orders {
      total
      createdAt
    }
  }
}
```

8.  **Customizing the Schema**
Update the schema as desired (/src/schema), creating new types, scalars, queries and mutations.  After you make changes be sure to stop the GraphQL server and run:

```bash
pnpm generate
```

This will create the new TypeScript Types from the GraphQL Schema in /src/__generated__/types.ts.  /src/schema/typeDefs.ts imports all sub-schemas.  

Depending on the size of your project or organizational preference, you may want to organize your schema directory based on feature.  

Ex: 

src/

├─ schema/

│ ├─ user/

│ │ ├─ typeDefs.graphql

│ │ ├─ resolvers.ts

│ ├─ order/

│ │ ├─ typeDefs.graphql

│ │ ├─ resolvers.ts

9.  **Testing**
JEST is configured for Typescript.  Example test cases are located in /src/__tests__/*.test.ts.  Tests and coverage report can be executed by running:

```bash
pnpm test
```

10. **Docker**
To improve the deployment process I included a Dockerfile and docker-compose.yml to fully containerize a production or development environments.  

```bash
# Development mode with hot reload
docker-compose up graphql-dev --build

# Production mode
docker-compose up graphql-prod --build
```

## Contributing

1. Fork the repository
2. Create a feature branch (git checkout -b feature/my-feature)
3. Commit your changes (git commit -m 'Add new feature')
4. Push to the branch (git push origin feature/my-feature)
5. Open a pull request

## License
This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.