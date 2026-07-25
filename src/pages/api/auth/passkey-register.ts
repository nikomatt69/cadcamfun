import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('🔐 Passkey registration request (TODO: implement)');

        // TODO: Implementare WebAuthn registration
        // Requires WebAuthn library and proper challenge generation

        return res.status(501).json({
            error: 'Passkey registration not yet implemented',
            details: 'Passkey authentication sarà disponibile in futuro',
            todoImplementation: {
                webauthn: 'Utilizzare @simplewebauthn/server',
                challengeGeneration: 'Generare challenge sicuro',
                credentialStorage: 'Salvare public key nel database',
                userVerification: 'Implementare user verification'
            }
        });

    } catch (error) {
        console.error('❌ Passkey registration error:', error);
        return res.status(500).json({
            error: 'Errore durante la registrazione passkey',
            details: error instanceof Error ? error.message : 'Errore interno del server'
        });
    }
} 