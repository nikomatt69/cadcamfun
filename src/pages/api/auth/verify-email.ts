// src/pages/api/auth/verify-email.ts
import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'Token mancante',
                details: 'Il token di verifica è richiesto'
            });
        }

        console.log('📧 Email verification attempt:', { tokenProvided: !!token });

        // Verifica e decodifica il JWT dell'email verification
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        if (decoded.type !== 'email-verification') {
            return res.status(400).json({
                error: 'Token non valido',
                details: 'Il token non è per la verifica email'
            });
        }

        console.log('📧 Email verification token verified:', {
            userId: decoded.userId,
            email: decoded.email,
            expiresAt: new Date(decoded.exp * 1000)
        });

        // Aggiorna l'utente per segnare l'email come verificata
        const user = await prisma.user.update({
            where: { id: decoded.userId },
            data: { emailVerified: new Date() },
            select: { id: true, email: true, name: true, emailVerified: true }
        });

        console.log('✅ Email verification successful:', {
            email: user.email,
            userId: user.id,
            verifiedAt: user.emailVerified
        });

        return res.status(200).json({
            success: true,
            message: 'Email verified successfully',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                emailVerified: user.emailVerified
            }
        });

    } catch (error: any) {
        console.error('❌ Email verification failed:', error);

        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({
                error: 'Link scaduto',
                details: 'Il link di verifica è scaduto. Richiedi un nuovo link.'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({
                error: 'Token non valido',
                details: 'Il link di verifica non è valido o è stato manomesso.'
            });
        }

        if (error.code === 'P2025') {
            return res.status(404).json({
                error: 'Utente non trovato',
                details: 'L\'utente associato al token di verifica non esiste'
            });
        }

        return res.status(500).json({
            error: 'Errore interno del server',
            details: 'Si è verificato un errore durante la verifica dell\'email'
        });
    }
} 