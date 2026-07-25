// src/pages/api/auth/signup.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from "../../../lib/prisma";
import bcrypt from 'bcryptjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, password, confirmPassword, name } = req.body;

        console.log('🔍 Signup attempt:', { email, name, hasPassword: !!password, hasConfirmPassword: !!confirmPassword });

        // Validazione input - TUTTI I CAMPI RICHIESTI
        if (!email || !password || !confirmPassword || !name) {
            return res.status(400).json({
                error: 'Tutti i campi sono richiesti',
                details: 'Email, nome, password e conferma password sono obbligatori'
            });
        }

        // Validazione email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Email non valida',
                details: 'Inserisci un indirizzo email valido'
            });
        }

        // Validazione nome
        if (name.trim().length < 2) {
            return res.status(400).json({
                error: 'Nome troppo corto',
                details: 'Il nome deve essere di almeno 2 caratteri'
            });
        }

        // Validazione password
        if (password.length < 8) {
            return res.status(400).json({
                error: 'Password troppo corta',
                details: 'La password deve essere di almeno 8 caratteri'
            });
        }

        // Validazione conferma password
        if (password !== confirmPassword) {
            return res.status(400).json({
                error: 'Le password non corrispondono',
                details: 'La password e la conferma devono essere identiche'
            });
        }

        // Controlla se l'email esiste già
        console.log('🔍 Checking if email exists...');
        const existingUser = await prisma.user.findUnique({
            where: { email: email.trim() }
        });

        if (existingUser) {
            return res.status(400).json({
                error: 'Email già in uso',
                details: 'Questo indirizzo email è già registrato'
            });
        }

        // Hash della password
        console.log('🔍 Hashing password...');
        const hashedPassword = await bcrypt.hash(password, 12);

        // Crea l'utente con Prisma
        console.log('🔍 Creating user...');
        const user = await prisma.user.create({
            data: {
                email: email.trim(),
                name: name.trim(),
                password: hashedPassword,
            },
            select: {
                id: true,
                email: true,
                name: true,
                emailVerified: true,
                createdAt: true,
            }
        });

        console.log('✅ Signup successful:', { email, userId: user.id });

        return res.status(201).json({
            success: true,
            message: 'Account creato con successo! Ora puoi effettuare il login.',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt,
            }
        });

    } catch (error) {
        console.error('❌ Signup error:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            error
        });

        // Gestione errori specifici
        let errorMessage = 'Errore durante la registrazione';
        let errorDetails = 'Si è verificato un errore imprevisto';

        if (error instanceof Error) {
            if (error.message.includes('Unique constraint') || error.message.includes('unique')) {
                errorMessage = 'Email già in uso';
                errorDetails = 'Questo indirizzo email è già registrato';
            } else {
                errorDetails = error.message;
            }
        }

        return res.status(500).json({
            error: errorMessage,
            details: errorDetails,
            debug: process.env.NODE_ENV === 'development' ? error : undefined
        });
    }
} 