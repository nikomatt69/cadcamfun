import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { POLAR_CONFIG, validatePolarConfig } from "@/src/lib/polar/config";
import { Polar } from "@polar-sh/sdk";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Only allow authenticated users (optional: restrict to admins)
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    // Test configuration validation
    validatePolarConfig();

    const polar = new Polar({
      accessToken: POLAR_CONFIG.accessToken,
    });

    // Test basic API connectivity
    const testResults = {
      configurationValid: true,
      apiConnectivity: false,
      organizationAccess: false,
      webhookEndpoint: `${process.env.NEXTAUTH_URL}/api/marketplace/webhooks/polar`,
      errors: [] as string[],
    };

    try {
      // Test if we can connect to Polar API
      const organization = await polar.organizations.get({
        id: POLAR_CONFIG.organizationId!,
      });
      console.log(organization);
      testResults.apiConnectivity = true;
      testResults.organizationAccess = !!organization;

      return res.status(200).json({
        success: true,
        message: "Polar.sh integration is working correctly",
        config: {
          hasAccessToken: !!POLAR_CONFIG.accessToken,
          hasOrganizationId: !!POLAR_CONFIG.organizationId,
          hasWebhookSecret: !!POLAR_CONFIG.webhookSecret,
          environment: POLAR_CONFIG.sandbox ? "sandbox" : "production",
        },
        tests: testResults,
      });
    } catch (apiError) {
      testResults.errors.push(
        `API connectivity failed: ${apiError instanceof Error ? apiError.message : "Unknown error"}`
      );

      return res.status(200).json({
        success: false,
        message: "Polar.sh configuration has issues",
        config: {
          hasAccessToken: !!POLAR_CONFIG.accessToken,
          hasOrganizationId: !!POLAR_CONFIG.organizationId,
          hasWebhookSecret: !!POLAR_CONFIG.webhookSecret,
          environment: POLAR_CONFIG.sandbox ? "sandbox" : "production",
        },
        tests: testResults,
      });
    }
  } catch (configError) {
    return res.status(500).json({
      success: false,
      message: "Polar.sh configuration is invalid",
      error:
        configError instanceof Error
          ? configError.message
          : "Unknown configuration error",
      config: {
        hasAccessToken: !!POLAR_CONFIG.accessToken,
        hasOrganizationId: !!POLAR_CONFIG.organizationId,
        hasWebhookSecret: !!POLAR_CONFIG.webhookSecret,
      },
    });
  }
}
