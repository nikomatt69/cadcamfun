import { lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";

const apiKey = process.env.LEMONSQUEEZY_API_KEY!;

if (!apiKey) {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      "Lemon Squeezy API key is not defined. Please set LEMONSQUEEZY_API_KEY in your environment variables."
    );
  }
  console.error("Lemon Squeezy API key is not defined.");
}

// Initialize Lemon Squeezy client
lemonSqueezySetup({ apiKey });

// Export the setup function or specific API methods if needed
// For simplicity, we'll rely on the global setup for now.
// You might want to export specific functions from the SDK later.
export { lemonSqueezySetup }; // Or export specific API call functions
