/** Expo Router search params are a string or a repeated list. Workspace routes use one id. */
export function routeParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : ""
}
