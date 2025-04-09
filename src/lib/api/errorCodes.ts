export const ErrorCodes = {
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];