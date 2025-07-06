// src/hooks/useGCodeFromCAMStore.tsx
import { useEffect, useState } from "react";
import { useCAMStore } from "@/src/store/camStore";

/**
 * Hook personalizzato per sincronizzare l'editor GCode con il camStore
 *
 * Questo hook recupera il gcode dallo store CAM e fornisce una funzione
 * per aggiornarlo, mantenendo l'editor e lo store sincronizzati
 */
export function useGCodeFromCAMStore() {
  // Recupera il gcode e la funzione setGcode dallo store
  const gcode = useCAMStore(state => state.gcode);
  const setStoreGcode = useCAMStore(state => state.setGcode);

  // Stato locale per tenere traccia delle modifiche in corso
  const [localGcode, setLocalGcode] = useState(gcode);

  // Sincronizza lo stato locale quando cambia lo store
  useEffect(() => {
    setLocalGcode(gcode);
  }, [gcode]);

  // Funzione per aggiornare il gcode sia localmente che nello store
  const updateGCode = (newGCode: string) => {
    setLocalGcode(newGCode);
    setStoreGcode(newGCode);
  };

  return {
    gcode: localGcode,
    setGcode: updateGCode
  };
}

export default useGCodeFromCAMStore;
