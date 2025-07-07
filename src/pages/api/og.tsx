import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const config = {
  runtime: "edge"
};

// Function to fetch and encode the logo
// Note: This assumes your logo is in the /public directory
// Adjust the path if necessary.
async function getLogoData() {
  try {
    const logoUrl = new URL("/logo.png", process.env.NEXTAUTH_URL || "http://localhost:3000");
    const response = await fetch(logoUrl.toString());
    if (!response.ok) throw new Error("Failed to fetch logo");
    const buffer = await response.arrayBuffer();
    return `data:${response.headers.get("content-type")};base64,${Buffer.from(buffer).toString("base64")}`;
  } catch (error) {
    console.error("Error fetching logo:", error);
    return null; // Return null if fetching fails
  }
}

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Extract parameters with fallbacks
  const title = searchParams.get("title")?.slice(0, 100) || "CAD/CAM FUN";
  const description =
    searchParams.get("description")?.slice(0, 150) || "Modern CAD/CAM for 2D/3D design & CNC machining";
  const author = searchParams.get("author")?.slice(0, 50);
  const siteName = "cadcamfun.xyz"; // Or fetch from env var

  // Fetch logo data
  const logoDataUri = await getLogoData();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", // New gradient
          fontFamily: '"Inter", sans-serif',
          color: "white",
          padding: "60px"
        }}
      >
        {/* Logo Area */}
        {logoDataUri && (
          <img
            width="100" // Adjust size as needed
            height="100" // Adjust size as needed
            src={logoDataUri}
            style={{
              position: "absolute",
              top: 40,
              left: 40,
              borderRadius: "50%" // Make it circular if desired
            }}
            alt="Logo"
          />
        )}

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: "bold",
            textAlign: "center",
            marginBottom: 30,
            lineHeight: 1.1,
            textShadow: "2px 2px 4px rgba(0,0,0,0.2)"
          }}
        >
          {title}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 32,
            textAlign: "center",
            marginBottom: 40,
            maxWidth: "80%",
            lineHeight: 1.4,
            opacity: 0.9
          }}
        >
          {description}
        </div>

        {/* Author (Optional) */}
        {author && (
          <div
            style={{
              fontSize: 28,
              marginBottom: 50,
              opacity: 0.8
            }}
          >
            By {author}
          </div>
        )}

        {/* Site Name Footer */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            fontSize: 24,
            opacity: 0.7
          }}
        >
          {siteName}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630
      // Add font loading if needed
    }
  );
}
