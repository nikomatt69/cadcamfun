import { updateToolpath } from 'src/lib/api/toolpaths';
import { toast } from 'react-hot-toast';

// Definisci tipi per finestre estese
declare global {
  interface Window {
    saveToolpath?: (toolpathData: any, metadata: any) => Promise<any>;
    updateToolpath?: (toolpathId: string, toolpathData: any, metadata?: any) => Promise<any>;
    currentCAMToolpath?: any;
    currentCAMState?: any;
  }
}

/**
 * Configura gli event listener per intercettare i toolpath generati dal CAM
 */
export const setupToolpathEventListener = () => {
  // Verifica se l'event listener è già configurato
  if (window.saveToolpath) return;
  
  console.log('Setting up toolpath event listeners');
  
  // Crea un event listener globale per eventi personalizzati
  window.addEventListener('toolpathGenerated', async (event: any) => {
    try {
      if (!event.detail) return;
      
      const { toolpathData, metadata } = event.detail;
      
      // Salva automaticamente il toolpath
      const savedToolpath = await updateToolpath(toolpathData);
      
      // Notifica l'utente
      toast.success('Toolpath salvato automaticamente');
      
      return savedToolpath;
    } catch (error) {
      console.error('Error in toolpath event listener:', error);
      toast.error('Errore nel salvataggio automatico del toolpath');
    }
  });
  
  // Funzione globale per salvare toolpath dal CAM esistente
  window.saveToolpath = async (toolpathData: any, metadata: any) => {
    try {
      const result = await updateToolpath(toolpathData);
      toast.success('Toolpath salvato con successo');
      return result;
    } catch (error) {
      console.error('Error in global saveToolpath function:', error);
      toast.error('Errore nel salvare il toolpath');
      throw error;
    }
  };
  
  // Funzione globale per aggiornare toolpath esistenti
  window.updateToolpath = async (toolpathId: string, toolpathData: any, metadata?: any) => {
    try {
      const result = await updateToolpath(toolpathData);
      toast.success('Toolpath aggiornato con successo');
      return result;
    } catch (error) {
      console.error('Error in global updateToolpath function:', error);
      toast.error('Errore nell\'aggiornare il toolpath');
      throw error;
    }
  };
  
  console.log('Toolpath event listeners configured');
};

// Inizializza event listener all'importazione del modulo
if (typeof window !== 'undefined') {
  // Esegui al caricamento ma dopo che il DOM è pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupToolpathEventListener);
  } else {
    setupToolpathEventListener();
  }
}