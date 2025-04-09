# CAD/CAM FUN


![CAD/CAM FUN Logo](https://cadcamfun.xyz/logo.png)

Un'innovativa piattaforma web per progettazione 2D/3D, modellazione parametrica e controllo di macchine CNC con integrazione avanzata di intelligenza artificiale.

## 🌟 Panoramica

CAD/CAM FUN è un'applicazione web completa che combina funzionalità CAD (Computer-Aided Design) e CAM (Computer-Aided Manufacturing) in un'interfaccia moderna e intuitiva. La piattaforma offre strumenti potenti per creare, modificare e produrre progetti, con assistenza AI integrata per una produttività ottimizzata.

### Caratteristiche Principali

- **Ambiente CAD/CAM Integrato**: Transizione fluida dalla progettazione alla produzione
- **Modellazione 2D/3D Avanzata**: Crea e modifica sia disegni 2D che modelli 3D complessi
- **Design Assistito da AI**: Sfrutta l'intelligenza artificiale per generare componenti, ottimizzare percorsi utensile e migliorare i progetti
- **Organizzazione & Collaborazione**: Gestisci progetti, componenti e team con controllo delle versioni
- **Integrazione Macchine CNC**: Genera e convalida codice G per vari tipi di macchine industriali
- **Librerie Complete di Materiali & Utensili**: Accedi a componenti standard e personalizza i tuoi
- **Interfaccia Web Moderna**: Design responsive con supporto per modalità scura e chiara
- **Sistema di Simulazione Integrato**: Verifica i percorsi utensile prima della produzione
- **Ottimizzazione Automatica**: Riduci i tempi di lavorazione e migliora la qualità dei risultati

## 🚀 Per Iniziare

### Prerequisiti

- Node.js (v16.x o superiore)
- npm o yarn
- Database PostgreSQL
- Browser web moderno (Chrome, Firefox, Edge, Safari)

### Installazione

1. Clona il repository:
   ```bash
   git clone https://github.com/nikomatt69/cad-cam-app-main.git
   cd cad-cam-app-main
   ```

2. Installa le dipendenze:
   ```bash
   npm install
   # oppure
   yarn install
   ```

3. Configura le variabili d'ambiente:
   Crea un file `.env` nella directory principale con le seguenti variabili:
   ```
   DATABASE_URL=stringa_connessione_postgres
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=tua_chiave_segreta
   # Aggiungi altre credenziali di servizio come necessario (Auth0, AWS, ecc.)
   ```

4. Genera il client Prisma:
   ```bash
   npm run prisma:generate
   # oppure
   yarn prisma:generate
   ```

5. Esegui le migrazioni del database:
   ```bash
   npm run prisma:migratedev
   # oppure
   yarn prisma:migratedev
   ```

6. Avvia il server di sviluppo:
   ```bash
   npm run dev
   # oppure
   yarn dev
   ```

7. Apri [http://localhost:3000](http://localhost:3000) nel tuo browser per vedere l'applicazione.

## 🏗️ Struttura del Progetto

```
cad-cam-app-main/
├── prisma/                  # Schema database e migrazioni
├── public/                  # Asset statici
├── src/
│   ├── components/          # Componenti React
│   │   ├── ai/              # Componenti relativi all'AI
│   │   ├── cad/             # Componenti editor CAD
│   │   ├── cam/             # Componenti editor CAM
│   │   ├── components/      # Gestione componenti generali
│   │   ├── layout/          # Componenti di layout
│   │   ├── library/         # Librerie di componenti
│   │   ├── tools/           # Gestione strumenti
│   │   └── ui/              # Componenti UI
│   ├── contexts/            # Context React
│   ├── hooks/               # Hook React personalizzati
│   ├── lib/                 # Funzioni utility e servizi
│   ├── pages/               # Pagine Next.js
│   │   ├── api/             # Route API
│   │   ├── auth/            # Pagine di autenticazione
│   │   ├── cad.tsx          # Pagina editor CAD
│   │   ├── cam.tsx          # Pagina editor CAM
│   │   └── ...              # Altre pagine
│   ├── store/               # Gestione stato
│   └── types/               # Definizioni di tipo TypeScript
└── ...
```

## 🧩 Tecnologie

- **Frontend**: React, Next.js, Tailwind CSS, Framer Motion
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (via Neon Serverless)
- **Autenticazione**: NextAuth.js, Auth0
- **Rendering 3D**: Three.js
- **Gestione Stato**: Zustand
- **Gestione Form**: React Hook Form, Zod
- **Integrazione AI**: Claude AI (Anthropic)
- **Cloud Storage**: AWS S3
- **Deployment**: Vercel

## ✨ Funzionalità Dettagliate

### Editor CAD

- **Strumenti di Modellazione 2D/3D**:
  - Creazione di geometrie primitive (linee, cerchi, archi, cubi, sfere, cilindri)
  - Operazioni booleane (unione, sottrazione, intersezione)
  - Estrusioni, rivoluzioni e swept paths
  - Modifica diretta della geometria con manipolatori 3D
  - Arrotondamenti e smussi avanzati

- **Capacità di Design Parametrico**:
  - Creazione di modelli guidati da vincoli e parametri
  - Relazioni geometriche (parallelismo, perpendicolarità, tangenza)
  - Equazioni e formule parametriche
  - Tabelle di configurazione per varianti di prodotto

- **Integrazione Libreria Componenti**:
  - Accesso a componenti standard (viti, dadi, cuscinetti)
  - Importazione e riutilizzo di parti personalizzate
  - Gestione delle librerie aziendali e personali
  - Sistema di tag e metadati per ricerca avanzata


- **Generazione Design Assistita da AI**:
  - Suggerimenti intelligenti basati sul contesto
  - Ottimizzazione topologica automatica
  - Completamento di geometrie parziali
  - Riconoscimento di pattern e intenzioni di design

- **Funzionalità Import/Export**:
  - Supporto per formati standard (STEP, IGES, STL, DXF)
  - Conversione intelligente tra formati
  - Riparazione automatica di mesh e geometrie importate
  - Esportazione ottimizzata per manifattura

### Editor CAM

- **Generazione Percorsi Utensile**:
  - Strategie avanzate per fresatura 2.5D e 3D
  - Lavorazioni di tornitura con supporto multiasse
  - Taglio laser e plasma con ottimizzazione nesting
  - Stampa 3D con supporti automatici

- **Creazione e Validazione Codice G**:
  - Generazione di codice personalizzato per diversi controller
  - Validazione sintattica e logica del codice
  - Editor integrato con evidenziazione della sintassi
  - Analisi preliminare per prevenire collisioni

- **Configurazione Macchine CNC**:
  - Modelli cinematici personalizzabili
  - Limiti di corsa, velocità e accelerazione
  - Gestione origini e sistemi di coordinate
  - Simulazione del comportamento della macchina

- **Gestione Materiali e Utensili**:
  - Database completo di materiali con proprietà fisiche
  - Libreria utensili con geometrie e parametri di taglio
  - Calcolo automatico delle velocità di avanzamento
  - Monitoraggio usura utensili e suggerimenti sostituzione

- **Percorsi Utensile Ottimizzati da AI**:
  - Riduzione automatica dei tempi ciclo
  - Ottimizzazione della qualità superficiale
  - Adattamento intelligente per diverse geometrie
  - Prevenzione di vibrazioni e sovraccarichi

- **Capacità di Simulazione**:
  - Simulazione realistica delle lavorazioni con rimozione materiale
  - Verifica delle collisioni in tempo reale
  - Analisi di tolleranze e sovrametalli
  - Stima precisa dei tempi di lavorazione

### Gestione Progetti

- **Controllo Accessi Basato su Ruoli**:
  - Definizione di permessi granulari
  - Flussi di approvazione configurabili
  - Tracciamento delle modifiche per utente
  - Integrazione con sistemi di identità aziendali

- **Condivisione e Riutilizzo Componenti**:
  - Repository centralizzato di parti
  - Gestione delle dipendenze tra componenti
  - Propagazione intelligente delle modifiche
  - Statistiche di utilizzo e popolarità

### Gestione Risorse

- **Libreria Materiali**:
  - Database esteso di materiali industriali
  - Proprietà fisiche e meccaniche dettagliate
  - Costi e disponibilità integrati
  - Suggerimenti per alternative equivalenti

- **Libreria Utensili**:
  - Catalogo completo di utensili standard
  - Generazione parametrica di utensili speciali
  - Condizioni di taglio raccomandate
  - Compatibilità con diversi portautensili

- **Profili Configurazione Macchine**:
  - Template per macchine comuni
  - Configurazione avanzata di post-processor
  - Gestione delle aree di lavoro
  - Calibrazione e compensazione errori

- **Librerie Componenti**:
  - Componenti standard organizzati per categoria
  - Parti specifiche per settore industriale
  - Elementi architettonici e strutturali
  - Componenti elettronici e PCB

## 🛠️ Sviluppo

### Build per Produzione

```bash
npm run build
# oppure
yarn build
```

### Esecuzione Test

```bash
npm run test
# oppure
yarn test
```

### Linting del Codice

```bash
npm run lint
# oppure
yarn lint
```

## 📚 Documentazione

La documentazione dettagliata per componenti, API ed esempi d'uso è disponibile nei commenti del codice e sarà ampliata in aggiornamenti futuri. Una documentazione completa è in fase di sviluppo e sarà disponibile all'indirizzo [docs.cadcamfun.xyz](https://docs.cadcamfun.xyz).

## 🤝 Contribuire

I contributi sono benvenuti, ma soggetti a revisione e approvazione. Si prega di contattare l'autore prima di inviare pull request significative.

1. Forka il repository
2. Crea il tuo branch per la funzionalità (`git checkout -b feature/funzionalita-incredibile`)
3. Commit delle tue modifiche (`git commit -m 'Aggiungi una funzionalità incredibile'`)
4. Push al branch (`git push origin feature/funzionalita-incredibile`)
5. Apri una Pull Request per revisione

## 📄 Licenza

Questo progetto è protetto da una Licenza d'Uso Proprietaria Limitata. Vedere il file [LICENSE](LICENSE) per i dettagli completi.

## 📞 Contatti

Nikomatt69 - [GitHub](https://github.com/nikomatt69)

Link al Progetto: [https://github.com/nikomatt69/cad-cam-app-main](https://github.com/nikomatt69/cad-cam-app-main)

Sito Web: [https://cadcamfun.xyz](https://cadcamfun.xyz)



---

© 2025 CAD/CAM FUN. Tutti i diritti riservati.
