/** Errors the user fixes in Providers & connections (a key, a quota, a model that is gone); a spent step budget or a failed tool is not one. */
export const isProviderError = (message: string): boolean =>
  !/step|continuation|automatic recovery|interrupted/i.test(message) &&
  /api key|auth|unauthor|forbidden|credit|billing|quota|rate.?limit|overload|model not found|unknown model|provider|no model|not connected|connection/i.test(message)
