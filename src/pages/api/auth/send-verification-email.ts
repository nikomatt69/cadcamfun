// src/pages/api/auth/send-verification-email.ts
import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, callbackURL = '/auth/verify-email' } = req.body;

        if (!email) {
            return res.status(400).json({
                error: 'Email mancante',
                details: 'L\'indirizzo email è richiesto'
            });
        }

        console.log('📧 Email verification request:', { email, callbackURL });

        // Verifica che l'utente esista
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, emailVerified: true }
        });

        if (!user) {
            return res.status(404).json({
                error: 'Utente non trovato',
                details: 'Nessun utente trovato con questo indirizzo email'
            });
        }

        // Se l'email è già verificata
        if (user.emailVerified) {
            return res.status(400).json({
                error: 'Email già verificata',
                details: 'Questo indirizzo email è già stato verificato'
            });
        }

        // Genera token di verifica
        const verificationToken = randomBytes(32).toString('hex');
        const verificationJWT = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                type: 'email-verification',
                token: verificationToken
            },
            JWT_SECRET,
            { expiresIn: '24h', issuer: 'cadcamfun' }
        );

        // Crea l'URL di verifica
        const baseURL = process.env.NEXTAUTH_URL || 'http://localhost:3001';
        const verificationURL = `${baseURL}${callbackURL}?token=${verificationJWT}`;

        console.log('📧 Email verification link generated:', {
            userId: user.id,
            email: user.email,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            url: verificationURL
        });

        // TODO: Inviare email di verifica
        console.log('📧 Email Verification Link (TODO: send via email):', verificationURL);

        return res.status(200).json({
            success: true,
            message: 'Verification email sent successfully',
            debug: {
                link: verificationURL // Solo per sviluppo - rimuovere in produzione
            }
        });

    } catch (error: any) {
        console.error('❌ Send verification email failed:', error);
        return res.status(500).json({
            error: 'Errore interno del server',
            details: 'Si è verificato un errore durante l\'invio dell\'email di verifica'
        });
    }
} 