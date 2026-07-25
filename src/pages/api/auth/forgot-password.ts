import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from "../../../lib/prisma";
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'your-fallback-secret-key';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, callbackURL = '/auth/reset-password' } = req.body;

        console.log('🔒 Password reset request:', { email, callbackURL });

        // Validazione input
        if (!email) {
            return res.status(400).json({
                error: 'Email richiesta',
                details: 'Inserisci un indirizzo email valido'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Email non valida',
                details: 'Inserisci un indirizzo email valido'
            });
        }

        // Verifica se l'utente esiste
        const user = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
            select: {
                id: true,
                email: true,
                name: true,
            }
        });

        if (!user) {
            // Per sicurezza, non rivelare se l'email esiste
            return res.status(200).json({
                success: true,
                message: 'Se l\'email esiste nel nostro sistema, riceverai un link per resettare la password.'
            });
        }

        // Genera token sicuro per password reset
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minuti

        // Crea password reset JWT
        const resetJWT = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                type: 'password-reset',
                token: resetToken,
            },
            JWT_SECRET,
            {
                expiresIn: '30m',
                issuer: 'cadcamfun'
            }
        );

        // Costruisci password reset URL
        const baseURL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
        const resetURL = `${baseURL}${callbackURL}?token=${resetJWT}`;

        console.log('🔒 Password reset link generated:', {
            userId: user.id,
            email: user.email,
            expiresAt,
            url: resetURL.substring(0, 100) + '...'
        });

        // TODO: Invia email con reset link
        // Per ora loggo il link per testing
        console.log('📧 Password Reset Link (TODO: send via email):', resetURL);

        return res.status(200).json({
            success: true,
            message: 'Se l\'email esiste nel nostro sistema, riceverai un link per resettare la password.',
            // Per development - rimuovi in production
            ...(process.env.NODE_ENV === 'development' ? {
                debugResetLink: resetURL
            } : {})
        });

    } catch (error) {
        console.error('❌ Forgot password error:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            error
        });

        return res.status(500).json({
            error: 'Errore durante la richiesta di reset password',
            details: error instanceof Error ? error.message : 'Errore interno del server'
        });
    }
} 