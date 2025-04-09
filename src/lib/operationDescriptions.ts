// src/lib/operationDescriptions.ts
export interface OperationDescription {
    title: string;
    description: string;
    icon?: string; // Opzionale per futura espansione con icone
  }
  
  export const getOperationDescription = (operationType: string): OperationDescription => {
    const descriptions: {[key: string]: OperationDescription} = {
      // Operazioni fresatura
      'contour': {
        title: 'Contornatura',
        description: 'Contornatura - Segue il profilo esterno o interno del pezzo mantenendo pareti verticali.'
      },
      'pocket': {
        title: 'Svuotamento Tasca',
        description: 'Svuotamento Tasca - Rimuove il materiale all\'interno di un profilo chiuso creando una cavità.'
      },
      'drill': {
        title: 'Foratura',
        description: 'Foratura - Crea fori verticali di profondità definita.'
      },
      'engrave': {
        title: 'Incisione',
        description: 'Incisione - Traccia linee poco profonde seguendo un percorso.'
      },
      'profile': {
        title: 'Profilo 3D',
        description: 'Profilo 3D - Segue un profilo tridimensionale variando la profondità di lavoro.'
      },
      'threading': {
        title: 'Filettatura',
        description: 'Filettatura - Crea filettature interne o esterne con fresa o maschio.'
      },
      '3d_surface': {
        title: 'Superficie 3D',
        description: 'Superficie 3D - Lavora superfici tridimensionali complesse con percorsi ottimizzati.'
      },
      
      // Operazioni tornio
      'turning': {
        title: 'Tornitura',
        description: 'Tornitura - Crea superfici cilindriche esterne rimuovendo materiale radialmente.'
      },
      'facing': {
        title: 'Sfacciatura',
        description: 'Sfacciatura - Crea superfici piane perpendicolari all\'asse di rotazione.'
      },
      'boring': {
        title: 'Alesatura',
        description: 'Alesatura - Allarga o rifinisce con precisione fori o superfici interne.'
      },
      // Altre operazioni tornio con stesse chiavi
      
      // Operazioni 3D printing
      'standard': {
        title: 'Stampa Standard',
        description: 'Stampa Standard - Stampa con parametri normali per qualità e velocità bilanciate.'
      },
      'vase': {
        title: 'Vaso (Spirale)',
        description: 'Vaso (Spirale) - Stampa in modalità a spirale continua senza cuciture per oggetti cavi.'
      }
      // Altre operazioni stampa 3D
    };
    
    return descriptions[operationType] || {
      title: 'Operazione personalizzata',
      description: 'Operazione personalizzata con parametri definiti dall\'utente.'
    };
  };