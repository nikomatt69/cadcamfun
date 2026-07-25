declare module "@apollo/client" {
  export const ApolloClient: any;
  export const InMemoryCache: any;
  export const createHttpLink: any;
  export const split: any;
}

declare module "@apollo/client/link/context" {
  export const setContext: any;
}

declare module "@apollo/client/link/subscriptions" {
  export const GraphQLWsLink: any;
}

declare module "@apollo/client/utilities" {
  export const getMainDefinition: any;
}
