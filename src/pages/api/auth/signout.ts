import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from "@/src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('👋 Signout request');

        // Pulisci JWT cookie (sempre presente)
        res.setHeader('Set-Cookie', [
            'auth-token=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        ]);

        // Prova anche Better Auth signout per completezza
        try {
            await auth.api.signOut({
                headers: new Headers(req.headers as Record<string, string>),
            });
            console.log('✅ Better Auth signout successful');
        } catch (authError) {
            console.log('⚠️ Better Auth signout failed (expected if using JWT):', authError instanceof Error ? authError.message : 'Unknown error');
            // Non è un errore fatale se Better Auth fallisce
        }

        console.log('✅ Signout successful - JWT cookie cleared');

        return res.status(200).json({
            success: true,
            message: 'Logout effettuato con successo!'
        });

    } catch (error) {
        console.error('❌ Signout error:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            error
        });

        // Anche in caso di errore, pulisci il cookie
        res.setHeader('Set-Cookie', [
            'auth-token=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        ]);

        return res.status(200).json({
            success: true,
            message: 'Logout effettuato (con pulizia forzata cookie)'
        });
    }
} 