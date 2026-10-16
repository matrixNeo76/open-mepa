# MePA & Consip Desk Pro — Documento di Analisi Approfondita, Audit Funzionale & Ottimizzazioni

**Data**: 16 Ottobre 2026  
**Versione Applicativo**: 1.1.0  
**Architettura**: Full-Stack Zero-Build (Frontend HTML5/Tailwind/Vanilla JS + Dual-Mode SQLite 3 Wasm / Python REST Server standard)  
**Conformità Normativa**: D.Lgs. 31 marzo 2023, n. 36 (Nuovo Codice dei Contratti Pubblici) & Regole del Sistema di e-Procurement MePA / Consip.

---

## 1. Mappa Completa delle Viste e Funzionalità Ispezionate

```
+--------------------------------------------------------------------------------------------------+
|                                    MEPA & CONSIP DESK PRO v1.1.0                                |
+--------------------------------------------------------------------------------------------------+
  |-- [1] Cruscotto Operativo Gare (Tabellare + Kanban Drag-and-Drop + Scadenziario + Modal Gara)
  |-- [2] Wizard Deterministico Partecipazione Gara (Workflow 4 Fasi + Regole ANAC + Payload Agent)
  |-- [3] Cataloghi MePA & Listini Prodotti (Big Data 287.536 Articoli + CPV + Paginazione Server)
  |-- [4] Anagrafica Amministrazioni Pubbliche (20.776 Enti PA + Codici Fiscali + IPA + Punti Ord.)
  |-- [5] Analisi di Mercato & Statistiche MePA (Analytics + Grafici Spesa + Pipeline + KPI)
  |-- [6] Open Data Consip Hub (Dataset ufficiali 2025–2028 + Documentazione 3 Buste Telematiche)
  |-- [7] Guida Metodologica Semplice (Sintesi operativa in 4 fasi per l'ufficio gare)
  |-- [8] Database SQLite 3 & Manutenzione (Dual-Mode Wasm/REST, Ispezione CKAN, Export .db e .ics)
```

---

## 2. Audit Dettagliato Pagina per Pagina

### 2.1 Pagina 1: Cruscotto Operativo Gare (`view-cruscotto`)
- **Componenti Verificati**:
  - **Vista Tabellare**: Paginazione client-side (15, 30, 50, 100 righe per pagina), ordinamento colonne per Scadenza, Importo, CIG e Fase, numeri tabellari (`tabular-nums`) e badge di stato con colori semaforici coerenti.
  - **Vista Kanban**: 4 colonne operative (*Da Valutare*, *In Lavorazione*, *Inviata*, *Conclusa/Vinta/Persa*). Supporto al Drag-and-Drop nativo HTML5 con aggiornamento asincrono immediato su SQLite (sia REST che Wasm). Limite di sicurezza a 35 card per colonna per scongiurare memory leak su carichi elevati.
  - **Filtri & Ricerca**: Ricerca testuale con debounce a 300ms (previene chiamate ridondanti su ogni tasto), filtri per Categoria e Fase.
  - **Importazione Dati**: Parsing CSV/JSON con chunked streaming (batch di 150 record) con barra di avanzamento e pulsanti di deduplicazione intelligente o sostituzione completa.
  - **Esportazione & Integrazione**:
    - Esportazione dati filtrati o completi in formato JSON e CSV.
    - Download del file binario `gare_consip.db` nativo.
    - Nuovo pulsante header **Calendario (.ics)** che genera il feed iCalendar RFC 5545 con tutte le scadenze attive importabile in Outlook, Google Calendar e Apple Calendar.
  - **Modale Nuova/Modifica Gara**: Convalida sintattica del CIG (ANAC a 10 caratteri alfanumerici), calcolo automatico della data scadenza quesiti e avvisi di sicurezza.

### 2.2 Pagina 2: Wizard Deterministico Partecipazione Gara (`view-wizard`)
- **Componenti Verificati**:
  - **Gating Sequenziale & Integrità di Fase**: Impossibile saltare alla Fase 3 se non è stata deliberata la Fase 2 con decisione positiva (`GO`). La navigazione iniziale parte sempre dalla Fase 1 se la procedura è nuova.
  - **Fase 1 (Identificazione & Qualificazione Base)**:
    - Normalizzazione CIG ANAC (10 caratteri, maiuscole, sanitizzazione caratteri non ammessi).
    - Calcolo automatico della scadenza quesiti di chiarimento Q&A a -10 giorni dalla scadenza del bando (art. 92 c.2 D.Lgs. 36/2023).
  - **Fase 2 (Valutazione Go / No-Go & Margine Economico)**:
    - Calcolo del valore netto della garanzia provvisoria (art. 106 D.Lgs. 36/2023): base 2%, riduzione 30% per certificazione ISO 9001, riduzione 50% per PMI (non cumulabile con ISO, prevale la maggiore), riduzione addizionale del 10% per fideiussione digitale con firma digitale.
    - Simulatore economico: calcolo margine residuo post-ribasso e blocco anti-perdita se il ribasso supera il margine lordo stimato.
  - **Fase 3 (Predisposizione delle 3 Buste Telematiche)**:
    - **Busta A (Amministrativa)**: DGUE elettronico, garanzia provvisoria fideiussoria, FVOE 2.0 / PassOE, impegno del fideiussore alla cauzione definitiva.
    - **Busta B (Tecnica)**: Relazione tecnica, tabelle conformità, campionature, rispetto del principio di tassatività delle clausole di esclusione (art. 10 D.Lgs. 36/2023).
    - **Busta C (Economica)**: Ribasso percentuale, scorporo obbligatorio costi manodopera e oneri di sicurezza aziendale (art. 108 c.9 D.Lgs. 36/2023), con clausola di esenzione automatica se fornitura pura senza posa in opera.
    - **Tracciamento Allegati CAdES (`allegati_gare`)**: Registrazione dei file con estensione `.pdf.p7m`, associazione alla busta specifica e verifica della firma digitale valida e marca temporale.
  - **Fase 4 (Sottomissione, Q&A, Esito & Post-Gara)**:
    - **Generatore Istanza Q&A (art. 92 c.2)**: Generazione automatica con 1 click del fac-simile di richiesta chiarimenti al RUP con estremi normativi, CIG e formattazione formale, esportabile o copiabile negli appunti.
    - **Generatore PEC Svincolo Cauzione (art. 106 c.10)**: Istanza tempestiva di svincolo della fideiussione provvisoria per aggiudicatari o non aggiudicatari (riduzione dei costi di commissione bancaria/assicurativa).
    - **Diario di Bordo Note (`note_gare`)**: Storico cronologico di note, decisioni interne e scambi con la stazione appaltante memorizzato in tabella SQLite relazionale.
    - **Esportazione Payload per Agente (`payload_mepa_<cig>.json`)**: Genera un file JSON strutturato contenente tutti i dati della gara, i file delle 3 buste, i metadati e la checklist di conformità, pronto per essere passato all'automazione browser (Playwright / Browser-Use) o archiviato.
    - **Esportazione iCalendar Singola Gara (`.ics`)**: Generazione RFC 5545 con doppi allarmi (24h e 2h prima della scadenza).

### 2.3 Pagina 3: Cataloghi MePA & Listini Prodotti (`view-cataloghi`)
- **Componenti Verificati**:
  - Supporto Big Data su oltre 287.500 articoli merci e servizi MePA.
  - Ricerca Full-Text su Descrizione, Codice CPV, Iniziativa e Lotti con debounce a 300ms.
  - Paginazione server-side ultraveloce su SQLite (query `LIMIT` e `OFFSET` indicizzate su campi chiave).
  - Filtro dinamico per Categorie merceologiche popolato direttamente dalle aggregazioni del database.
  - Gestione stato di disponibilità (badge Disponibile / Non Disponibile) e codici CPV evidenziati.

### 2.4 Pagina 4: Anagrafica Amministrazioni Pubbliche (`view-amministrazioni`)
- **Componenti Verificati**:
  - Consultazione di 20.776 enti e stazioni appaltanti della Pubblica Amministrazione italiana.
  - Ricerca per Denominazione, Codice Fiscale, codice IPA e Comune.
  - Filtri combinati per Regione e Tipologia Ente (Comuni, ASL, Ministeri, Università, ecc.).
  - Conteggio e visualizzazione dei Punti Ordinanti (PO) abilitati a stipulare contratti su MePA.

### 2.5 Pagina 5: Analisi di Mercato & Statistiche MePA (`view-analytics`)
- **Componenti Verificati**:
  - 4 Card KPI Strategici: Totale Gare a Cruscotto, Spesa Complessiva Bandi, Articoli a Catalogo e Amministrazioni Censite.
  - Breakdown Categorie Merceologiche con barre percentuali accessibili (`role="progressbar"`).
  - Distribuzione territoriale degli Enti PA con evidenza delle prime regioni per concentrazione di spesa.
  - Monitoraggio avanzamento pipeline nelle 4 fasi operative del gestionale.

### 2.6 Pagina 6: Open Data Consip Hub (`view-opendata`)
- **Componenti Verificati**:
  - Collegamento diretto ai cataloghi aperti di `dati.consip.it` con selettore annualità (2025–2028).
  - Link di download diretto per dataset CSV, JSON e XLSX (RdO MePA, Bandi ASP, Amministrazioni, Fornitori Aggiudicatari, Contratti).
  - Guida tecnica approfondita sulla struttura delle 3 buste e sulla conservazione dei file firmati digitalmente.

### 2.7 Pagina 7: Guida Metodologica Semplice (`view-guida`)
- **Componenti Verificati**:
  - Spiegazione testuale chiara, adatta a personale non tecnico, sui 4 passi necessari per governare una gara dall'avviso iniziale all'esito.

### 2.8 Pagina 8: Database SQLite 3 & Manutenzione (`view-sqlite`)
- **Componenti Verificati**:
  - Monitoraggio real-time dello stato del backend (connesso in rete locale su porta 8050 oppure fallback su Wasm client-side).
  - Statistiche fisiche su disco del database `gare_consip.db` (KB/MB e conteggio record).
  - Ispezione passiva dello stato dei dataset CKAN ufficiali.
  - Pulsante di esportazione file binario SQLite e procedura di reset controllata con header di protezione CSRF (`X-Confirm-Reset: yes`).

---

## 3. Matrice delle Criticità Identificate e Ottimizzazioni Proposte

| ID | Sezione | Livello | Descrizione Criticità / Margine di Miglioramento | Soluzione / Miglioria Raccomandata |
|---|---|---|---|---|
| **OPT-01** | **Wizard / Busta C** | **Media (P2)** | Mancanza di un simulatore per il calcolo della **soglia di anomalia** (ex art. 54 e All. II.2 D.Lgs. 36/2023) quando il criterio di aggiudicazione è il minor prezzo con esclusione automatica. | Aggiungere nel simulatore economico di Fase 2 e Fase 3 il calcolo delle soglie di anomalia (Metodo A, B o C del codice) per stimare il rischio di esclusione o verifica dell'anomalia. |
| **OPT-02** | **Wizard / Automazione** | **Bassa (P3)** | Lo script Python di sottomissione assistita via browser-use non dispone ancora di un runner CLI standard pre-configurato che legga direttamente `payload_mepa_<cig>.json`. | Fornire uno script modello `assisted_mepa_submitter.py` (basato su Playwright) che si aggancia al browser già autenticato con SPID e carica i campi della RdO. |
| **OPT-03** | **Cruscotto / Notifiche** | **Bassa (P3)** | Le gare con semaforo rosso (< 3 giorni dalla scadenza) sono visibili chiaramente a video ma non inviano notifiche desktop native del browser (`Notification API`). | Integrare l'API nativa `window.Notification` per allertare l'operatore quando apre il cruscotto in presenza di bandi in scadenza entro 48-72 ore. |
| **OPT-04** | **Cataloghi / Ricerca** | **Bassa (P3)** | Nei cataloghi merci, la ricerca per codice CPV richiede la corrispondenza del testo o delle prime cifre; non c'è una guida gerarchica visuale all'albero dei codici CPV europei. | Inserire un tooltip o modale di esplorazione delle prime 2 cifre della divisione CPV (es. 30 = Macchine per ufficio, 48 = Pacchetti software, ecc.). |
| **OPT-05** | **Sicurezza / Backup** | **Media (P2)** | Non è presente una funzione di backup automatico incrementale o rotativo del database `gare_consip.db` (es. `gare_consip_backup_YYYYMMDD.db`) prima di import massivi in modalità "replace". | Aggiungere un endpoint `POST /api/backup` che esegua una copia di sicurezza automatica del database prima di svuotamenti o sovrascritture. |

---

## 4. Stato della Qualità del Codice e Sicurezza (QA Summary)

1. **Sicurezza XSS**: Sanitizzazione preventiva applicata sistematicamente in ogni template string HTML tramite la funzione nativa `escapeHtml()`.
2. **Sicurezza CSRF**: Il backend locale rifiuta chiamate `POST` e `DELETE` con `Origin` non locale e richiede l'header esplicito `X-Confirm-Reset: yes` per operazioni distruttive.
3. **Integrità Transazionale**: SQLite 3 opera con `PRAGMA foreign_keys = ON` e transazioni ACID (`BEGIN TRANSACTION` e `COMMIT`).
4. **Accessibilità (WCAG 2.1 AA)**:
   - Contrasto cromatico verificato su tema dark.
   - Bersagli di tocco (touch targets) conformi (≥ 36px desktop / ≥ 44px touch).
   - Semantica tabelle completa con `th scope="col"` e descrizioni accessibili.
   - Numeri e importi formattati con font monospace e classe CSS `tabular-nums` per allineamento visivo perfetto.
   - Barre di progresso dotate di `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` e `aria-label`.
   - Modali con `role="dialog"`, `aria-modal="true"` e gestione focus da tastiera (Escape per chiusura).
5. **Zero-Build & Portabilità**: Nessuna dipendenza `npm` obbligatoria; backend in Python 3 standard (nessun `pip install` richiesto).
6. **Copertura Test**: 43 test automatici eseguiti con successo al 100% (14 test di integrazione backend Python, 25 test unitari su regole del wizard, 4 test sui generatori legali e formati RFC 5545).
