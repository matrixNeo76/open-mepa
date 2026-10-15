# MePA & Consip Desk Pro 🏛️💻

> **Piattaforma di Monitoraggio Bandi, Gestione Gare e Cruscotto Operativo con Database Relazionale SQLite 3.**  
> Progettata per Imprese, Uffici Gare e Professionisti che operano sul Mercato Elettronico della Pubblica Amministrazione (MePA), Consip S.p.A. e piattaforme ASP regionali.

---

## 🌟 Caratteristiche Principali

- **Motore Relazionale SQLite 3 Nativo**: Memorizzazione strutturata su file standard `gare_consip.db` con indici su CIG, Categoria e Scadenza. Transazioni ACID e zero dipendenze pesanti.
- **Architettura Dual-Mode (Ibrida)**:
  - **Live Server Mode**: Server HTTP e REST API integrato in Python nativo (standard library `http.server` + `sqlite3`), con persistenza istantanea su disco.
  - **Standalone Wasm Mode**: Funziona anche aprendo direttamente il file HTML nel browser tramite `sql.js` (WebAssembly) e persistenza locale di emergenza.
- **Cruscotto Operativo & Semaforo Scadenze**:
  - 🔴 **Emergenza (< 3 giorni)**: Priorità massima con indicatore pulsante.
  - 🟡 **In Lavorazione (4 - 7 giorni)**: Predisposizione buste e chiarimenti.
  - 🟢 **Ordinaria (> 7 giorni)**: Studio bando, Go / No-Go e sopralluoghi.
- **Doppia Modalità di Visualizzazione**:
  - **Vista Tabellare**: Con paginazione reattiva (15, 30, 50, 100 per pagina), ordinamento dinamico per data/importo e debounce sulla ricerca testuale.
  - **Vista Kanban**: Visualizzazione a 4 colonne con **Drag-and-Drop nativo HTML5** per avanzare di fase con un semplice trascinamento.
- **Sicurezza e Protezione XSS**: Sanitizzazione preventiva di tutti i dati provenienti da file esterni.
- **Hub Open Data Consip (2025–2028)**: Collegamento diretto alle risorse ufficiali di `dati.consip.it` (RdO MePA, Bandi e Gare, Amministrazioni, Operatori Economici, Acquisti).
- **Importazione ed Esportazione Universale**:
  - Ingestion asincrona anti-freeze per file JSON, CSV e database binari `.db`.
  - Esportazione istantanea in `.db` (SQLite Format 3), `.json` e `.csv`.

---

## 📂 Struttura del Progetto

```
open-mepa/
│
├── index.html                                   # Frontend SPA modulare principale
├── gestionale_bandi_mepa_open_data_consip.html   # Compatibilità retroattiva (alias modulare)
├── script_generatore_database_sqlite_3.py       # Server HTTP/REST locale + Motore SQLite 3
├── consip_stream_ingestion.py                   # Script streaming ingestion per dataset Consip CKAN
├── test_integration.py                          # Suite di collaudo e test di integrazione backend/API
├── css/
│   └── styles.css                               # Stili personalizzati, scrollbar e media query di stampa
├── js/
│   ├── utils.js                                 # Funzioni helper, sanitizzazione XSS, parsing valute/date
│   ├── config.js                                # Configurazioni CKAN Consip e seed demo
│   ├── api.js                                   # Client standardizzato REST API
│   ├── db-engine.js                             # Inizializzazione dual-mode (REST vs Wasm)
│   ├── importer.js                              # Motore ingestion chunked CSV/JSON/DB
│   ├── app.js                                   # Router principale, modali e bootstrap applicativo
│   └── views/
│       ├── cruscotto.js                         # Controller Gare, Tabella, Kanban Drag-and-Drop
│       ├── wizard.js                            # Wizard deterministico 4 Fasi & Dual Hand-Off
│       ├── cataloghi.js                         # Controller Ricerca Cataloghi (287k+ articoli)
│       ├── amministrazioni.js                   # Controller Anagrafica PA (20k+ enti)
│       └── analytics.js                         # Controller Statistiche e Distribuzione di Mercato
├── json/                                        # Directory per dataset dump Consip (con README)
├── .ui-craft/                                   # Specifiche di design (brief.md, spec.md)
├── roadmap.md                                   # Roadmap strategica in formato OKF v0.2
├── agents.md                                    # Architettura e prompt del team di agenti AI
└── readme.md                                    # Questa documentazione
```

---

## 🚀 Guida Rapida all'Avvio

### Modalità 1: Live Server Full-Stack (Consigliata)
Questa modalità avvia il server REST Python che salva e legge direttamente dal file fisico `gare_consip.db` su disco.

1. **Genera il database ed avvia il server**:
   Apri un terminale (PowerShell o CMD) nella cartella del progetto ed esegui:
   ```bash
   python script_generatore_database_sqlite_3.py
   ```
2. **Apri il browser**:
   Il terminale mostrerà:
   ```
   Server attivo su: http://127.0.0.1:8050
   ```
   Apri il browser all'indirizzo [http://127.0.0.1:8050](http://127.0.0.1:8050).  
   Vedrai il badge verde **"● Connesso al Server Python (gare_consip.db)"**: qualsiasi modifica o nuova gara inserita verrà memorizzata in tempo reale nel database su disco.

Per arrestare il server, premi `Ctrl + C` nel terminale.

---

### Modalità 2: Standalone Offline (Senza Server)
Se desideri consultare o utilizzare l'applicativo senza avviare Python:
1. Fai doppio click sul file `gestionale_bandi_mepa_open_data_consip.html` per aprirlo in Google Chrome, Microsoft Edge, Mozilla Firefox o Safari.
2. Il sistema caricherà il motore SQLite WebAssembly (`sql.js`).
3. Puoi caricare i dati demo, importare un file `.csv`/`.json` o caricare direttamente un backup `.db`.
4. Puoi salvare il database aggiornato cliccando su **"Scarica DB SQLite 3 (.db)"**.

---

## 🗄️ Schema del Database SQLite 3 (`gare_consip.db`)

La tabella principale `gare` è strutturata per mappare esaustivamente i dati degli appalti:

```sql
CREATE TABLE IF NOT EXISTS gare (
    id TEXT PRIMARY KEY,
    cig TEXT UNIQUE,
    category TEXT,
    region TEXT,
    source TEXT,
    authority TEXT,
    title TEXT,
    amount REAL,
    deadline TEXT,
    status TEXT,
    owner TEXT,
    link TEXT
);

CREATE INDEX IF NOT EXISTS idx_cig ON gare(cig);
CREATE INDEX IF NOT EXISTS idx_category ON gare(category);
CREATE INDEX IF NOT EXISTS idx_deadline ON gare(deadline);
```

### Campi Principali
| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | `TEXT` | Identificativo univoco interno del record (chiave primaria) |
| `cig` | `TEXT` | Codice Identificativo Gara rilasciato da ANAC (univoco con clausola UPSERT) |
| `category` | `TEXT` | Area merceologica: `IT`, `CANCELLERIA`, `ARREDI`, `SANITA`, `ENERGIA`, `ALTRO` |
| `region` | `TEXT` | Regione di competenza della stazione appaltante |
| `source` | `TEXT` | Tipologia: `RdO MePA`, `Bandi e Gare`, `Gare ASP`, `Manuale` |
| `authority` | `TEXT` | Denominazione Ente / Stazione Appaltante |
| `title` | `TEXT` | Oggetto della fornitura o del servizio |
| `amount` | `REAL` | Importo a base d'asta in Euro (€) |
| `deadline` | `TEXT` | Data e ora di scadenza (formato ISO `YYYY-MM-DDTHH:MM`) |
| `status` | `TEXT` | Fase ciclo di vita: `Da Valutare`, `In Lavorazione`, `Inviata`, `Vinta`, `Persa`, `Scartata` |
| `owner` | `TEXT` | Responsabile interno assegnato alla procedura |
| `link` | `TEXT` | URL di collegamento alla procedura su AcquistinretePA |

---

## 🔌 Specifiche API REST (Server Python)

Il server integrato in `script_generatore_database_sqlite_3.py` espone le seguenti API RESTful:

| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/` | Serve l'applicazione web (`gestionale_bandi_mepa_open_data_consip.html`) |
| `GET` | `/api/status` | Restituisce lo stato del server, conteggio gare, cataloghi e amministrazioni |
| `GET` | `/api/gare` | Restituisce la lista gare (supporta paginazione `?page=1&pageSize=30`) |
| `GET` | `/api/cataloghi` | Ricerca paginata nel catalogo merci MePA (`?q=toner&page=1&pageSize=25`) |
| `GET` | `/api/amministrazioni` | Ricerca paginata anagrafica PA (`?q=comune&regione=LAZIO&page=1&pageSize=25`) |
| `GET` | `/api/analytics` | Aggregazioni di mercato, distribuzione valore gare, regioni e settori |
| `POST` | `/api/gare` | Inserisce o aggiorna una gara (Upsert automatico su CIG) |
| `DELETE` | `/api/gare/<id>` | Elimina la gara specificata dal database |
| `POST` | `/api/batch` | Inserimento massivo di gare da file JSON o CSV con deduplica |
| `GET` | `/api/export/db` | Download del file binario `gare_consip.db` |
| `POST` | `/api/reset` | Svuota la tabella `gare` nel database |

---

## 🌐 Dataset Ufficiali Open Data Consip S.p.A.

I collegamenti diretti verificati nel portale CKAN `dati.consip.it` integrati nell'Hub sono:
1. **Cataloghi Beni & Servizi**: [dati.consip.it/group/cat-cataloghi](https://dati.consip.it/group/cat-cataloghi) (Dataset massivo di ~600MB con oltre 287.000 articoli merci)
2. **Amministrazioni Registrate**: [dati.consip.it/group/cat-amministrazioni](https://dati.consip.it/group/cat-amministrazioni) (Elenco enti PA e punti ordinanti)
3. **Bandi e Gare ASP**: [dati.consip.it/dataset/gare-asp](https://dati.consip.it/dataset/gare-asp) (Macro-gare centralizzate e per conto di singole PA)
4. **Operatori Economici**: [dati.consip.it/group/cat-operatori-economici](https://dati.consip.it/group/cat-operatori-economici) (Albo fornitori abilitati e aggiudicatari)
5. **Negoziazioni (RdO & Trattative)**: [dati.consip.it/group/cat-negoziazioni](https://dati.consip.it/group/cat-negoziazioni) (RdO e Trattative Dirette MePA)
6. **Acquisti Effettuati**: [dati.consip.it/group/cat-acquisti](https://dati.consip.it/group/cat-acquisti) (Ordini e contratti concluse con spesa effettiva)

> [!NOTE]
> **Gestione Big Data Cataloghi (~600MB):** Il file dei cataloghi merci non viene processato direttamente nel browser (ciò causerebbe blocco della scheda per saturazione memoria JavaScript), ma viene gestito dallo streaming engine in background `consip_stream_ingestion.py` nella tabella `cataloghi` di SQLite, consentendo ricerche istantanee tramite `/api/cataloghi`.

---

## 📋 La Metodologia in 4 Fasi del Ciclo di Vita

L'applicativo guida l'utente attraverso il percorso sequenziale per la gestione delle gare pubbliche:

```
  1. Identificazione       2. Valutazione (Go/No-Go)      3. Predisposizione Buste         4. Esito & Chiusura
+--------------------+   +---------------------------+   +--------------------------+   +--------------------+
| • Inserisci CIG    |   | • Verifica Requisiti ISO  |   | • Busta A (DGUE, Fidei.) |   | • Graduatoria sed. |
| • Rileva Ente & €  |-->| • Margine stimato         |-->| • Busta B (Off. Tecnica) |-->| • Svincolo Cauzione|
| • Termine scadenza |   | • Assegna Responsabile    |   | • Busta C (Off. Econom.) |   | • Archivia Storico |
+--------------------+   +---------------------------+   +--------------------------+   +--------------------+
```

---

## 🛠️ Requisiti di Sistema

- **Python**: Versione 3.8 o superiore (nessun pacchetto `pip` richiesto, utilizza moduli standard `sqlite3`, `http.server`, `urllib`, `json`).
- **Browser Web**: Qualsiasi browser moderno (Google Chrome, Microsoft Edge, Mozilla Firefox, Safari) con supporto JavaScript e WebAssembly.
- **Sistema Operativo**: Windows 10/11, macOS o Linux.

---

## 📄 Documenti di Riferimento

- [roadmap.md](roadmap.md): Roadmap strategica in formato standard Open Knowledge Format (OKF v0.2), con matrice di prioritizzazione MoSCoW, debito tecnico e OKR.
- [agents.md](agents.md): Definizione del team di agenti AI per sviluppo continuo, web scraping dei dataset e collaudo normativo.
- **Normativa di Riferimento**: D.Lgs. 36/2023 (Codice dei Contratti Pubblici) e Regolamento Operativo MePA (AcquistinretePA).

---

## 📝 Licenza
Distribuito sotto licenza MIT. Libero per uso commerciale e personale.
