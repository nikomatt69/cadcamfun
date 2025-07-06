import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { requireAuth } from "@/src/lib/api/auth";
import formidable from "formidable";
import fs from "fs";
import path from "path";

// Disable body parser for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const userId = await requireAuth(req, res);
  if (!userId) {
    return; // requireAuth already sent the response
  }

  if (req.method === "GET") {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          bio: true,
          location: true,
          website: true,
          company: true,
          title: true,
          publicProfile: true,
          showEmail: true,
          createdAt: true,
          // Add relation counts
          _count: {
            select: {
              projects: true,
              // Add other counts as needed
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json(user);
    } catch (error) {
      console.error("Error fetching profile:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  if (req.method === "PUT") {
    try {
      // Parse form data
      const form = formidable({
        maxFileSize: 2 * 1024 * 1024, // 2MB
        filter: function ({ name, originalFilename, mimetype }) {
          // Only allow images for profile image
          return (
            name === "profileImage" && (mimetype?.startsWith("image/") || false)
          );
        },
      });

      const [fields, files] = await form.parse(req);

      // Extract field values (formidable returns arrays)
      const name = Array.isArray(fields.name)
        ? fields.name[0]
        : fields.name || "";
      const bio = Array.isArray(fields.bio)
        ? fields.bio[0]
        : fields.bio || null;
      const location = Array.isArray(fields.location)
        ? fields.location[0]
        : fields.location || null;
      const website = Array.isArray(fields.website)
        ? fields.website[0]
        : fields.website || null;
      const company = Array.isArray(fields.company)
        ? fields.company[0]
        : fields.company || null;
      const title = Array.isArray(fields.title)
        ? fields.title[0]
        : fields.title || null;
      const publicProfile = Array.isArray(fields.publicProfile)
        ? fields.publicProfile[0] === "true"
        : true;
      const showEmail = Array.isArray(fields.showEmail)
        ? fields.showEmail[0] === "true"
        : false;

      // Validation
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "Name is required" });
      }

      if (name.length > 100) {
        return res
          .status(400)
          .json({ message: "Name must be less than 100 characters" });
      }

      if (bio && bio.length > 500) {
        return res
          .status(400)
          .json({ message: "Bio must be less than 500 characters" });
      }

      if (website && !isValidUrl(website)) {
        return res.status(400).json({ message: "Invalid website URL" });
      }

      // Handle profile image upload
      let imageUrl = null;
      const profileImageFile = Array.isArray(files.profileImage)
        ? files.profileImage[0]
        : files.profileImage;

      if (profileImageFile) {
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(
          process.cwd(),
          "public",
          "uploads",
          "profiles"
        );
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate unique filename
        const fileExtension = path.extname(
          profileImageFile.originalFilename || ""
        );
        const fileName = `${userId}-${Date.now()}${fileExtension}`;
        const filePath = path.join(uploadsDir, fileName);

        // Copy file to uploads directory
        fs.copyFileSync(profileImageFile.filepath, filePath);

        // Clean up temp file
        fs.unlinkSync(profileImageFile.filepath);

        imageUrl = `/uploads/profiles/${fileName}`;
      }

      // Prepare update data
      const updateData: any = {
        name: name.trim(),
        bio: bio?.trim() || null,
        location: location?.trim() || null,
        website: website?.trim() || null,
        company: company?.trim() || null,
        title: title?.trim() || null,
        publicProfile,
        showEmail,
      };

      // Add image URL if uploaded
      if (imageUrl) {
        updateData.image = imageUrl;
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          bio: true,
          location: true,
          website: true,
          company: true,
          title: true,
          publicProfile: true,
          showEmail: true,
          updatedAt: true,
        },
      });

      return res.status(200).json({
        message: "Profile updated successfully",
        user: updatedUser,
        name: updatedUser.name,
        email: updatedUser.email,
        image: updatedUser.image,
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url.startsWith("http") ? url : `https://${url}`);
    return true;
  } catch {
    return false;
  }
}
