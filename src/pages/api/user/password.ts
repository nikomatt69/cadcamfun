import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { compare, hash } from "bcrypt";
import { requireAuth } from "src/lib/api/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const userId = await requireAuth(req, res);

  if (!userId) {
    return; // requireAuth already sent the response
  }

  // Support only PUT requests for password updates
  if (req.method !== "PUT") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { currentPassword, newPassword } = req.body;

    // Verify that all required fields are present
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current password and new password are required" });
    }

    // Verify that the new password has at least 8 characters
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters long" });
    }

    // Retrieve user from database with account information
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          where: {
            providerId: 'credential'
          }
        }
      }
    });

    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found" });
    }

    // Find the credential account
    const credentialAccount = user.accounts.find(acc => acc.providerId === 'credential');

    if (!credentialAccount || !credentialAccount.password) {
      return res
        .status(404)
        .json({ message: "No password set for this account" });
    }

    // Verify that the current password is correct
    const passwordValid = await compare(currentPassword, credentialAccount.password);

    if (!passwordValid) {
      return res.status(400).json({ message: "Current password is invalid" });
    }

    // Hash the new password
    const hashedNewPassword = await hash(newPassword, 12);

    // Update password in the credential account
    await prisma.account.update({
      where: { id: credentialAccount.id },
      data: {
        password: hashedNewPassword,
        updatedAt: new Date(),
      },
    });

    // Update user's updatedAt timestamp
    await prisma.user.update({
      where: { id: userId },
      data: {
        updatedAt: new Date(),
      },
    });

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error updating password:", error);
    return res.status(500).json({ message: "Error updating password" });
  }
}
