import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const WAITLIST_FILE = path.join(process.cwd(), 'data', 'waitlist.json');

// Assicurati che la directory e il file esistano
const initWaitlistFile = () => {
  const dir = path.dirname(WAITLIST_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (!fs.existsSync(WAITLIST_FILE)) {
    fs.writeFileSync(WAITLIST_FILE, JSON.stringify([]));
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Metodo non consentito' });
  }
  
  try {
    const { email } = req.body;
    
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email non valida' 
      });
    }
    
    // Inizializza il file se non esiste
    initWaitlistFile();
    
    // Leggi il file esistente
    const waitlistData = JSON.parse(fs.readFileSync(WAITLIST_FILE, 'utf8'));
    
    // Verifica se l'email esiste già
    if (waitlistData.some((entry: any) => entry.email === email)) {
      return res.status(409).json({ 
        success: false, 
        message: 'Email già registrata' 
      });
    }
    
    // Aggiungi il nuovo indirizzo email
    waitlistData.push({
      email,
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
    
    // Salva il file aggiornato
    fs.writeFileSync(WAITLIST_FILE, JSON.stringify(waitlistData, null, 2));
    
    return res.status(201).json({ 
      success: true, 
      message: 'Iscrizione completata con successo' 
    });
  } catch (error) {
    console.error('Errore waitlist:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Si è verificato un errore durante la registrazione' 
    });
  }
}