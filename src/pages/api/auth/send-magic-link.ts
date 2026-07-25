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
        const { email, callbackURL = '/auth/verify-magic-link' } = req.body;

        console.log('🔗 Magic link request:', { email, callbackURL });

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
                emailVerified: true,
            }
        });

        if (!user) {
            // Per sicurezza, non rivelare se l'email esiste
            return res.status(200).json({
                success: true,
                message: 'Se l\'email esiste nel nostro sistema, riceverai un link magico a breve.'
            });
        }

        // Genera token sicuro per magic link
        const magicToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minuti

        // Salva magic link token nel database (optional - puoi anche usare solo JWT)
        // Per ora uso JWT diretto per semplicità
        const magicJWT = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                type: 'magic-link',
                token: magicToken,
            },
            JWT_SECRET,
            {
                expiresIn: '15m',
                issuer: 'cadcamfun'
            }
        );

        // Costruisci magic link URL
        const baseURL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
        const magicLinkURL = `${baseURL}${callbackURL}?token=${magicJWT}`;

        console.log('🔗 Magic link generated:', {
            userId: user.id,
            email: user.email,
            expiresAt,
            url: magicLinkURL.substring(0, 100) + '...'
        });

        // TODO: Invia email con magic link
        // Per ora loggo il link per testing
        console.log('📧 Magic Link (TODO: send via email):', magicLinkURL);

        return res.status(200).json({
            success: true,
            message: 'Se l\'email esiste nel nostro sistema, riceverai un link magico a breve.',
            // Per development - rimuovi in production
            ...(process.env.NODE_ENV === 'development' ? {
                debugMagicLink: magicLinkURL
            } : {})
        });

    } catch (error) {
        console.error('❌ Send magic link error:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            error
        });

        return res.status(500).json({
            error: 'Errore durante l\'invio del link magico',
            details: error instanceof Error ? error.message : 'Errore interno del server'
        });
    }
} 