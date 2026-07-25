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

        console.log('🔗 Magic link verification attempt:', { tokenProvided: !!token });

        // Verifica e decodifica il JWT del magic link
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        if (decoded.type !== 'magic-link') {
            return res.status(400).json({
                error: 'Token non valido',
                details: 'Il token non è un magic link valido'
            });
        }

        console.log('🔗 Magic link token verified:', {
            userId: decoded.userId,
            email: decoded.email,
            expiresAt: new Date(decoded.exp * 1000)
        });

        // Verifica che l'utente esista ancora
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, name: true }
        });

        if (!user) {
            return res.status(404).json({
                error: 'Utente non trovato',
                details: 'L\'utente associato al magic link non esiste'
            });
        }

        // Crea un JWT di autenticazione per l'utente
        const authToken = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                name: user.name,
                iss: 'cadcamfun'
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Imposta il cookie di autenticazione
        res.setHeader(
            'Set-Cookie',
            `auth-token=${authToken}; HttpOnly; Secure=${process.env.NODE_ENV === 'production'}; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`
        );

        console.log('✅ Magic link verification successful:', {
            email: user.email,
            userId: user.id
        });

        return res.status(200).json({
            success: true,
            message: 'Magic link verified successfully',
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });

    } catch (error: any) {
        console.error('❌ Magic link verification failed:', error);

        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({
                error: 'Link scaduto',
                details: 'Il magic link è scaduto. Richiedi un nuovo link.'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({
                error: 'Token non valido',
                details: 'Il magic link non è valido o è stato manomesso.'
            });
        }

        return res.status(500).json({
            error: 'Errore interno del server',
            details: 'Si è verificato un errore durante la verifica del magic link'
        });
    }
} 