import Stripe from "stripe";

// Enterprise Stripe Configuration
const secretKey = process.env.STRIPE_SECRET_KEY;
const isProduction = process.env.NODE_ENV === "production";

// Validate Stripe configuration
if (!secretKey) {
  const errorMessage =
    "Stripe secret key is not defined. Please set STRIPE_SECRET_KEY in your environment variables.";
  if (isProduction) {
    // In production, log error and throw to prevent silent failures
    console.error("[STRIPE ERROR]", errorMessage);
    throw new Error(errorMessage);
  } else {
    throw new Error(errorMessage);
  }
}

// Enterprise-level Stripe initialization
const stripe = new Stripe(secretKey, {
  apiVersion: "2025-02-24.acacia", // Latest stable API version
  typescript: true,
  telemetry: false, // Disable telemetry for enterprise use
  maxNetworkRetries: 3, // Automatic retries for network issues
  timeout: 15000, // 15 second timeout
  appInfo: {
    name: "CADCAMFun Enterprise",
    version: "1.0.0",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://cadcamfun.xyz",
  },
});

// Enterprise logging utility
export const logStripeEvent = (
  event: string,
  data: any,
  level: "info" | "warn" | "error" = "info"
) => {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    event,
    environment: process.env.NODE_ENV,
    ...data,
  };

  if (level === "error") {
    console.error(`[STRIPE ERROR] ${timestamp}:`, logData);
  } else if (level === "warn") {
    console.warn(`[STRIPE WARN] ${timestamp}:`, logData);
  } else {
    console.log(`[STRIPE INFO] ${timestamp}:`, logData);
  }
};

// Enterprise error handling wrapper
export const executeStripeOperation = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  retries: number = 2
): Promise<T> => {
  let lastError: Error = new Error("Unknown error occurred");

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await operation();

      if (attempt > 0) {
        logStripeEvent("operation_retry_success", {
          operation: operationName,
          attempt: attempt + 1,
          totalRetries: retries,
        });
      }

      return result;
    } catch (error: any) {
      lastError = error;

      logStripeEvent(
        "operation_attempt_failed",
        {
          operation: operationName,
          attempt: attempt + 1,
          totalRetries: retries,
          errorType: error.type,
          errorCode: error.code,
          errorMessage: error.message,
        },
        "warn"
      );

      // Don't retry on certain error types
      if (
        error.type === "card_error" ||
        error.type === "invalid_request_error" ||
        attempt === retries
      ) {
        break;
      }

      // Exponential backoff
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logStripeEvent(
    "operation_failed",
    {
      operation: operationName,
      totalAttempts: retries + 1,
      finalError: lastError.message,
    },
    "error"
  );

  throw lastError;
};

// Health check function for monitoring
export const checkStripeHealth = async (): Promise<{
  healthy: boolean;
  message: string;
}> => {
  try {
    await executeStripeOperation(
      () => stripe.balance.retrieve(),
      "health_check"
    );
    return { healthy: true, message: "Stripe connection healthy" };
  } catch (error: any) {
    return {
      healthy: false,
      message: `Stripe health check failed: ${error.message}`,
    };
  }
};

export default stripe;
