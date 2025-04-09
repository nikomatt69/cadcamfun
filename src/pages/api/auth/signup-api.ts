// src/pages/api/auth/signup-api.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { hash } from 'bcrypt';
import { prisma } from '@/src/lib/prisma';
import { sendErrorResponse, sendSuccessResponse, handleApiError } from '@/src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }

    const { name, email, password } = req.body;
    
    // Basic validation
    if (!name || !email || !password) {
      return sendErrorResponse(res, 'Missing required fields', 400);
    }
    
    if (password.length < 8) {
      return sendErrorResponse(res, 'Password must be at least 8 characters long', 400);
    }
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      return sendErrorResponse(res, 'Email already in use', 400);
    }
    
    // Hash the password
    const hashedPassword = await hash(password, 12);
    
    // Create the user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;
    
    return sendSuccessResponse(res, 
      { user: userWithoutPassword }, 
      'User created successfully'
    );
  } catch (error) {
    return handleApiError(error, res);
  }
}