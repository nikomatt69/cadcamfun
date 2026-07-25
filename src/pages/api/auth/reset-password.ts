import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from "../../../lib/prisma";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'your-fallback-secret-key';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { token, newPassword, confirmPassword } = req.body;

        console.log('🔒 Password reset execution:', { hasToken: !!token, hasPassword: !!newPassword });

        // Validazione input
        if (!token) {
            return res.status(400).json({
                error: 'Token richiesto',
                details: 'Password reset token mancante'
            });
        }

        if (!newPassword || !confirmPassword) {
            return res.status(400).json({
                error: 'Password richieste',
                details: 'Inserisci la nuova password e la conferma'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                error: 'Password non corrispondenti',
                details: 'La nuova password e la conferma devono essere identiche'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                error: 'Password troppo corta',
                details: 'La password deve essere di almeno 8 caratteri'
            });
        }

        // Verifica password reset JWT
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET) as any;
        } catch (jwtError) {
            console.log('❌ Password reset token invalid:', jwtError instanceof Error ? jwtError.message : 'Unknown error');
            return res.status(400).json({
                error: 'Token non valido o scaduto',
                details: 'Il link di reset password è scaduto o non valido. Richiedi un nuovo link.'
            });
        }

        // Verifica che sia un password reset token
        if (decoded.type !== 'password-reset') {
            return res.status(400).json({
                error: 'Token non valido',
                details: 'Questo non è un token di reset password valido'
            });
        }

        // Verifica che l'utente esista ancora
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                email: true,
                name: true,
            }
        });

        if (!user) {
            return res.status(404).json({
                error: 'Utente non trovato',
                details: 'L\'account associato a questo reset token non esiste più'
            });
        }

        // Verifica email match
        if (user.email !== decoded.email) {
            return res.status(400).json({
                error: 'Token non valido',
                details: 'L\'email associata al token non corrisponde'
            });
        }

        // Hash della nuova password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Aggiorna la password nel database
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                updatedAt: new Date()
            }
        });

        console.log('✅ Password reset successful:', {
            userId: user.id,
            email: user.email
        });

        return res.status(200).json({
            success: true,
            message: 'Password resettata con successo! Ora puoi effettuare il login con la nuova password.',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            }
        });

    } catch (error) {
        console.error('❌ Reset password error:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            error
        });

        return res.status(500).json({
            error: 'Errore durante il reset della password',
            details: error instanceof Error ? error.message : 'Errore interno del server'
        });
    }
} 