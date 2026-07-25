// src/pages/api/auth/test-direct-create.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from "../../../lib/prisma";
import bcrypt from 'bcryptjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, password, name } = req.body;

        console.log('🔍 Testing direct Prisma user creation:', { email, name, hasPassword: !!password });

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Hash della password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Tenta di creare l'utente direttamente con Prisma
        console.log('🔍 Creating user with Prisma directly...');
        const user = await prisma.user.create({
            data: {
                email: email.trim(),
                name: name.trim(),
                password: hashedPassword,
                // emailVerified: null, // Lasciamo che sia null di default
                // Non impostiamo emailVerified per vedere se è questo il problema
            },
            select: {
                id: true,
                email: true,
                name: true,
                emailVerified: true,
                createdAt: true,
            }
        });

        console.log('✅ Direct Prisma creation successful:', { userId: user.id, email: user.email });

        return res.status(201).json({
            success: true,
            message: 'User created successfully with Prisma',
            user
        });

    } catch (error) {
        console.error('❌ Direct Prisma creation error:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            error
        });

        return res.status(500).json({
            error: 'Direct creation failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: process.env.NODE_ENV === 'development' ? error : undefined
        });
    }
} 