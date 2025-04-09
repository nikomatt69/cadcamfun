// Servizio per la gestione delle immagini utente nel localStorage
export const ImageService = {
  /**
   * Salva un'immagine nel localStorage come Base64
   * @param file - Il file immagine da salvare
   * @param userId - ID univoco dell'utente (o email)
   * @returns Una Promise che risolve con l'URL dell'immagine in Base64
   */
  saveImageToLocalStorage: (file: File, userId: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Verifica che il file sia effettivamente un'immagine
      if (!file.type.startsWith('image/')) {
        reject(new Error('Il file non è un immagine valida'));
        return;
      }

      // Usa FileReader per convertire l'immagine in Base64
      const reader = new FileReader();
      
      reader.onload = (event) => {
        if (!event.target?.result) {
          reject(new Error('Errore durante la lettura del file'));
          return;
        }

        const base64String = event.target.result as string;
        
        try {
          // Salva nel localStorage con una chiave specifica per l'utente
          const key = `user_profile_image_${userId}`;
          localStorage.setItem(key, base64String);
          resolve(base64String);
        } catch (error) {
          // Gestisce l'errore di quota del localStorage
          console.error('Errore durante il salvataggio nel localStorage:', error);
          reject(new Error('Impossibile salvare l\'immagine. Prova con un\'immagine più piccola.'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Errore durante la lettura del file'));
      };

      // Legge il file come Data URL (Base64)
      reader.readAsDataURL(file);
    });
  },

  /**
   * Recupera un'immagine dal localStorage
   * @param userId - ID univoco dell'utente (o email)
   * @returns L'URL dell'immagine in Base64 o null se non trovata
   */
  getImageFromLocalStorage: (userId: string): string | null => {
    const key = `user_profile_image_${userId}`;
    return localStorage.getItem(key);
  },

  /**
   * Rimuove un'immagine dal localStorage
   * @param userId - ID univoco dell'utente (o email)
   */
  removeImageFromLocalStorage: (userId: string): void => {
    const key = `user_profile_image_${userId}`;
    localStorage.removeItem(key);
  }
};

export default ImageService;