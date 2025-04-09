import { NextApiResponse } from "next";

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleApiError(error: unknown, res: NextApiResponse) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
      details: error.details
    });
  }

  console.error('Unhandled error:', error);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
}