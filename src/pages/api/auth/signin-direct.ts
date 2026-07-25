// src/pages/api/auth/signin-direct.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from "../../../lib/prisma";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, password } = req.body;

        console.log('🔍 Direct signin attempt:', { email, hasPassword: !!password });

        // Validazione input
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email e password sono richiesti',
                details: 'Inserisci sia email che password per accedere'
            });
        }

        // Trova l'utente nel database
        console.log('🔍 Finding user...');
        const user = await prisma.user.findUnique({
            where: { email: email.trim() },
            select: {
                id: true,
                email: true,
                name: true,
                password: true,
                emailVerified: true,
                createdAt: true,
            }
        });

        if (!user) {
            console.log('❌ User not found:', email);
            return res.status(404).json({
                error: 'Utente non trovato',
                details: 'Nessun account registrato con questa email'
            });
        }

        if (!user.password) {
            console.log('❌ User has no password:', email);
            return res.status(400).json({
                error: 'Password non impostata',
                details: 'Questo account non ha una password. Usa un metodo di login alternativo.'
            });
        }

        // Verifica la password
        console.log('🔍 Verifying password...');
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            console.log('❌ Invalid password for user:', email);
            return res.status(401).json({
                error: 'Credenziali non valide',
                details: 'Email o password non corretti'
            });
        }

        // Crea JWT token di sessione
        const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret';
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                name: user.name,
            },
            secret,
            {
                expiresIn: '7d',
                issuer: 'cadcamfun'
            }
        );

        // Imposta cookie di sessione
        res.setHeader('Set-Cookie', [
            `auth-token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
        ]);

        console.log('✅ Direct signin successful:', { email, userId: user.id });

        return res.status(200).json({
            success: true,
            message: 'Login effettuato con successo!',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt,
            },
            token
        });

    } catch (error) {
        console.error('❌ Direct signin error:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            error
        });

        return res.status(500).json({
            error: 'Errore durante il login',
            details: error instanceof Error ? error.message : 'Errore interno del server',
            debug: process.env.NODE_ENV === 'development' ? error : undefined
        });
    }
} 