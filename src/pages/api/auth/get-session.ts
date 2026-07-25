import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import { prisma } from "../../../lib/prisma";
import { auth } from "@/src/lib/auth";

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'your-fallback-secret-key';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('🔍 Get session request');

        // Primo: verifica JWT dai cookie (priorità)
        const token = req.cookies['auth-token'];

        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as any;
                console.log('✅ JWT session found:', { userId: decoded.userId, email: decoded.email });

                // Recupera dati freschi dell'utente dal database
                const user = await prisma.user.findUnique({
                    where: { id: decoded.userId },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        emailVerified: true,
                        createdAt: true,
                        updatedAt: true,
                    }
                });

                if (user) {
                    return res.status(200).json({
                        session: {
                            user: user,
                            expires: new Date(decoded.exp * 1000).toISOString(),
                            sessionToken: token
                        }
                    });
                }
            } catch (jwtError) {
                console.log('❌ JWT verification failed:', jwtError instanceof Error ? jwtError.message : 'Unknown error');
                // Continua con Better Auth fallback
            }
        }

        // Fallback: Better Auth 
        try {
            const session = await auth.api.getSession({
                headers: new Headers(req.headers as Record<string, string>),
            });

            if (session?.user) {
                console.log('✅ Better Auth session found:', { userId: (session.user as any)?.id });
                return res.status(200).json({ session });
            }
        } catch (authError) {
            console.log('❌ Better Auth session failed:', authError instanceof Error ? authError.message : 'Unknown error');
        }

        // Nessuna sessione valida trovata
        console.log('❌ No valid session found');
        return res.status(401).json({
            error: 'No active session',
            session: null
        });

    } catch (error) {
        console.error('❌ Get session error:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            error
        });

        return res.status(500).json({
            error: 'Errore durante il controllo della sessione',
            details: error instanceof Error ? error.message : 'Errore interno del server'
        });
    }
} 