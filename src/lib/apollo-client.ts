// lib/apollo-client.ts
import { ApolloClient, InMemoryCache, createHttpLink, split } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { getMainDefinition } from "@apollo/client/utilities";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
// Note: Apollo client should use server-side session management
// We'll need to update this to use the Better Auth client when needed

// HTTP link for queries and mutations
const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_API_URL || "/api/graphql"
});

// WebSocket link for subscriptions
const wsLink =
  typeof window !== "undefined"
    ? new GraphQLWsLink(
        createClient({
          url:
            process.env.NEXT_PUBLIC_GRAPHQL_WS_URL ||
            (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + "/api/graphql",
          connectionParams: async () => {
            // TODO: Implement Better Auth session retrieval for WebSocket
            return {
              // authorization: session?.user ? `Bearer ${session.user.id}` : ""
            };
          }
        })
      )
    : null;

// Auth link to add authorization headers
const authLink = setContext(async (_, { headers }) => {
  // TODO: Implement Better Auth session retrieval for Apollo client
  // For now, we'll handle auth at the API level
  return {
    headers: {
      ...headers,
      // authorization: session?.user ? `Bearer ${session.user.id}` : ""
    }
  };
});

// Split links based on operation type
const splitLink =
  typeof window !== "undefined" && wsLink
    ? split(
        ({ query }) => {
          const definition = getMainDefinition(query);
          return definition.kind === "OperationDefinition" && definition.operation === "subscription";
        },
        wsLink,
        authLink.concat(httpLink)
      )
    : authLink.concat(httpLink);

// Create the Apollo Client
const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: "cache-and-network"
    }
  }
});

export default apolloClient;
