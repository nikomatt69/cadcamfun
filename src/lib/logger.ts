export const logger = {
  error: (error: unknown, context?: Record<string, unknown>) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    
    console.error({
      timestamp: new Date().toISOString(),
      level: 'error',
      name: errorName,
      message: errorMessage,
      ...context,
      stack: error instanceof Error ? error.stack : undefined
    });
  }
};