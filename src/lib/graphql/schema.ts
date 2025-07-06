// lib/graphql/schema.ts
import { makeExecutableSchema } from "@graphql-tools/schema";
import { loadSchemaSync } from "@graphql-tools/load";
import { GraphQLFileLoader } from "@graphql-tools/graphql-file-loader";
import { join } from "path";
import { resolvers } from "./resolvers";

// Load the schema from the GraphQL file
const typeDefs = loadSchemaSync(join(process.cwd(), "graphql/schema.graphql"), {
  loaders: [new GraphQLFileLoader()]
});

// Create the executable schema by combining type definitions and resolvers
export const schema = makeExecutableSchema({
  typeDefs,
  resolvers
});
