import { Polar } from "@polar-sh/sdk";

const isDevelopment = process.env.NODE_ENV === "development";

export const polarConfig = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
});

export const POLAR_CONFIG = {
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  organizationId: process.env.POLAR_ORGANIZATION_ID,
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET,
  baseUrl: process.env.POLAR_BASE_URL || "https://api.polar.sh",
  sandbox: process.env.NODE_ENV !== "production",
};

export function validatePolarConfig() {
  const missing = [];

  if (!POLAR_CONFIG.accessToken) {
    missing.push("POLAR_ACCESS_TOKEN");
  }

  if (!POLAR_CONFIG.organizationId) {
    missing.push("POLAR_ORGANIZATION_ID");
  }

  if (!POLAR_CONFIG.webhookSecret) {
    missing.push("POLAR_WEBHOOK_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required Polar.sh environment variables: ${missing.join(", ")}\n` +
        "Please add these to your .env.local file:\n" +
        missing.map((key) => `${key}=your_${key.toLowerCase()}_here`).join("\n")
    );
  }

  return true;
}

export const MARKETPLACE_CONFIG = {
  defaultCommissionRate: 10, // 10% commission
  supportedFileTypes: [
    "CAD_MODEL",
    "GCODE",
    "TEMPLATE",
    "TOOL",
    "DRAWING",
    "PROJECT",
  ],
  supportedLicenseTypes: ["PERSONAL", "COMMERCIAL", "OPEN_SOURCE", "CUSTOM"],
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedImageTypes: ["image/jpeg", "image/png", "image/webp"],
  maxPreviewImages: 5,
};
