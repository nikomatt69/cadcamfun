import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHash } from "crypto";

const prisma = new PrismaClient();

// Function to generate a secure API key and its hash
function generateApiKey() {
  const apiKey = `cad_${randomBytes(24).toString("hex")}`; // Prefix + 32 random bytes
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  return { apiKey, keyHash };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);

  if (!userId) {
    return; // requireAuth already sent the response
  }

  try {
    switch (req.method) {
      // List API keys for the user (excluding the hash)
      case "GET":
        const keys = await prisma.apiKey.findMany({
          where: { userId },
          select: {
            id: true,
            name: true,
            createdAt: true,
            lastUsed: true,
            expiresAt: true
            // IMPORTANT: Never return keyHash to the client
          },
          orderBy: {
            createdAt: "desc"
          }
        });
        return res.status(200).json(keys);

      // Generate a new API key
      case "POST":
        const { name } = req.body;
        if (!name || typeof name !== "string" || name.trim() === "") {
          return res.status(400).json({ message: "Key name is required" });
        }

        const { apiKey, keyHash } = generateApiKey();

        await prisma.apiKey.create({
          data: {
            name: name.trim(),
            keyHash,
            userId
            // expiresAt: // Optional: Set expiry logic here
          }
        });

        // IMPORTANT: Only return the raw apiKey ONCE upon creation
        return res.status(201).json({
          message: "API Key generated successfully. Store it securely!",
          apiKey, // Return the plaintext key here ONLY
          name: name.trim()
        });

      // Revoke (delete) an API key
      case "DELETE":
        const { keyId } = req.query;
        if (!keyId || typeof keyId !== "string") {
          return res.status(400).json({ message: "Key ID is required" });
        }

        const keyToDelete = await prisma.apiKey.findUnique({
          where: { id: keyId }
        });

        // Ensure the key belongs to the authenticated user
        if (!keyToDelete || keyToDelete.userId !== userId) {
          return res.status(404).json({ message: "API Key not found or access denied" });
        }

        await prisma.apiKey.delete({
          where: { id: keyId }
        });
        return res.status(200).json({ message: "API Key revoked successfully" });

      default:
        res.setHeader("Allow", ["GET", "POST", "DELETE"]);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error("API Key Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await prisma.$disconnect();
  }
}
