// src/schema/index.ts
import { loadFilesSync } from "@graphql-tools/load-files";
import { mergeTypeDefs } from "@graphql-tools/merge";

// Load all the combine all the .graphql files into a single typeDefs Object
const typesArray = loadFilesSync("src/schema/**/*.graphql", { extensions: ["graphql"] });
export const typeDefs = mergeTypeDefs(typesArray);
