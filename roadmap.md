---
type: Roadmap
title: "MePA & Consip Desk Pro - Roadmap Strategica ed Evolutiva"
description: "Audit delle criticità UI/UX e funzionali dell'applicativo MePA/Consip con architettura SQLite 3 e piano evolutivo dettagliato."
tags:
  - mepa
  - consip
  - sqlite3
  - ui-ux-audit
  - roadmap
  - okf-v0.2
generated:
  by: "agent:antigravity-deepmind"
  at: 2026-10-15T13:55:00+02:00
sources:
  - uri: "file:///c:/Users/auresystem/repos/aure-mepa/gestionale_bandi_mepa_open_data_consip.html"
    role: "Frontend SPA HTML5 / JS / Tailwind / Wasm SQLite"
  - uri: "file:///c:/Users/auresystem/repos/aure-mepa/script_generatore_database_sqlite_3.py"
    role: "Generatore e gestore Database SQLite 3"
verified:
  - by: "agent:antigravity-deepmind"
    at: 2026-10-15T13:55:00+02:00
status: stable
stale_after: 2027-04-01
---

# MePA & Consip Desk Pro — Roadmap Strategica ed Evolutiva (OKF v0.2)

## 1. Visione di Prodotto e Contesto
**MePA & Consip Desk Pro** è una piattaforma progettata per micro, piccole e medie imprese (PMI) e professionisti che operano negli appalti pubblici italiani (MePA - Mercato Elettronico della Pubblica Amministrazione, Consip S.p.A. e piattaforme ASP).

L'obiettivo primario è **abbattere la complessità operativa** nella ricerca, qualificazione (Go / No-Go), preparazione e tracciamento delle gare d'appalto attraverso un database relazionale **SQLite 3** veloce, trasparente e portabile, eliminando fogli Excel dispersivi e software proprietari rigidi.

---

## 2. Stato Attuale (AS-IS) & Debito Tecnico

Il sistema attuale è composto da due file non ancora integrati fra loro:
1. `gestionale_bandi_mepa_open_data_consip.html`: Single Page Application contenente cruscotto tabellare, vista kanban a 4 fasi, hub di link Open Data e documentazione della procedura a 3 buste. L'interfaccia si appoggia a `sql.js` (SQLite compilato in WebAssembly) caricato da CDN.
2. `script_generatore_database_sqlite_3.py`: Script Python standalone che genera il file binario `gare_consip.db` con 7 record di esempio e indici su `cig`, `category`, `deadline`.

### 2.1 Audit Criticità UI/UX
| ID | Area | Gravità | Descrizione del Problema | Impatto sull'Utente |
|---|---|---|---|---|
| **UI-01** | Tabella & Performance | **Critica (P0)** | **Assenza di paginazione/virtual scroll**: la tabella renderizza sincronicamente tutte le righe (`filtered.map`). Con dataset Consip reali (10.000+ righe), il browser si congela. | Freeze completo della scheda del browser. |
| **UI-02** | Ricerca & Input | **Alta (P1)** | **Assenza di debounce**: ogni pressione di tasto nella casella di ricerca scatena `renderApp()`. | Rallentamenti e digitazione a scatti su grandi elenchi. |
| **UI-03** | Kanban Interattivo | **Alta (P1)** | **Mancanza di Drag-and-Drop nativo**: le card del Kanban non possono essere trascinate tra le colonne per aggiornare la fase. | L'utente è costretto a cliccare "Modifica", cambiare la select e salvare. |
| **UI-04** | Sicurezza DOM | **Critica (P0)** | **Vulnerabilità XSS (Cross-Site Scripting)**: i campi `title`, `authority`, `cig` sono iniettati direttamente in `.innerHTML` senza sanificazione. | Rischio di esecuzione codice JS malevolo iniettato tramite file CSV/JSON esterni. |
| **UI-05** | Persistenza Locale | **Alta (P1)** | **Perdita dati al refresh (F5)** in modalità Wasm: i dati modificati vivono nella RAM volatile di `sql.js`. Senza salvataggio su IndexedDB o server, un ricaricamento cancella il lavoro non esportato. | Perdita del lavoro svolto se l'utente ricarica per sbaglio la pagina. |
| **UI-06** | Mobile & Usabilità | **Media (P2)** | **Tabella non responsive su smartphone**: 10 colonne provocano scroll orizzontale forzato; bottoni di modifica/cancellazione con target touch inferiore a 44x44px. | Difficoltà d'uso su tablet e smartphone. |
| **UI-07** | Validazione Form | **Media (P2)** | **Validazione incompleta**: il campo CIG non convalida la formula sintattica ANAC (10 caratteri alfanumerici o SmartCIG); assenza di avvisi per importi a zero o date scadute. | Inserimento di dati sporchi o errati nel database. |
| **UI-08** | Big Data & Memory Leak | **Critica (P0)** | **Saturazione DOM su dataset massivi (~600MB / 287.000+ righe)**: l'importazione diretta di cataloghi merci nel thread browser provocava freeze completo e blocco del Kanban. | Separazione architetturale tra gare d'appalto (`gare`) e catalogo articoli (`cataloghi`), limite render Kanban a 35 card/colonna e modulo streaming Python dedicato. |

### 2.2 Audit Criticità Funzionali & Architetturali
| ID | Area | Gravità | Descrizione del Problema | Soluzione Necessaria |
|---|---|---|---|---|
| **FN-01** | Integrazione Full-Stack | **Critica (P0)** | **Disconnessione tra Python e HTML**: lo script Python genera `gare_consip.db` su disco, ma non c'è comunicazione né server per consentire all'interfaccia HTML di leggere e scrivere direttamente su quel file. | Creazione di un server REST integrato in Python (modulo standard `http.server` + `sqlite3`) e collegamento del frontend tramite chiamate API asincrone. |
| **FN-02** | Architettura Ibrida | **Alta (P1)** | Se il server locale non è attivo, l'utente che apre l'HTML con doppio click deve poter continuare a lavorare via Wasm SQLite. | Implementazione di modalità Dual-Mode: Live Server (API) se presente, altrimenti Standalone Wasm con persistenza `localStorage`/`IndexedDB`. |
| **FN-03** | Ingestion Dati Consip | **Media (P2)** | Il caricamento dei dataset CSV/JSON è manuale; non vi è sincronizzazione programmata automatica tramite le API CKAN di `dati.consip.it`. | Sviluppo di un modulo Python di fetch automatico dalle API REST CKAN di Consip. |
| **FN-04** | Gestione Documentale | **Media (P2)** | L'applicazione traccia i metadati della gara ma non permette di allegare o generare bozze per le 3 Buste (Amministrativa, Tecnica, Economica). | Integrazione di checklist documentale e archivio allegati locali. |

---

## 3. Matrice di Prioritizzazione (Metodo MoSCoW)

### Must Have (Indispensabili - Release v1.0)
- [x] Generazione fisica e indicizzazione del database `gare_consip.db`.
- [x] Server REST nativo in Python (`http.server` + `sqlite3`) senza dipendenze esterne.
- [x] Connessione automatica del frontend HTML al backend locale con sincronizzazione istantanea.
- [x] Sanitizzazione HTML (anti-XSS) in tutte le viste (tabella e kanban).
- [x] Paginazione della tabella (15, 30, 50, 100 record per pagina).
- [x] Debounce (300ms) sulla barra di ricerca testuale.
- [x] Drag-and-Drop nativo HTML5 tra le colonne del Kanban con aggiornamento immediato dello stato nel DB.
- [x] Validazione avanzata del CIG (ANAC / SmartCIG).
- [x] Architettura modulare Zero-Build (separazione CSS e JS in moduli `js/views/`, `js/db-engine.js`, `js/importer.js`, ecc.).
- [x] Paginazione server-side e indicizzazione ad alte prestazioni per Cataloghi MePA (287k+ articoli) e Amministrazioni PA (20k+ enti).
- [x] Audit e Unificazione UI-Craft (WCAG 2.1 AA, Focus-visible, touch target ≥36px/44px, numeri tabellari tabular-nums, semantica tabelle scope="col", ARIA dialog & progressbar, rispetto prefers-reduced-motion).

### Should Have (Importanti - Release v1.1)
- [ ] Script di sincronizzazione automatica giornaliera dalle API CKAN di `dati.consip.it`.
- [ ] Esportazione personalizzata in formato Excel (.xlsx) formattato per il management.
- [ ] Gestione note e diario di bordo per ogni singola gara (tabella relazionale `note_gare`).
- [ ] Backup automatico rotativo del file `gare_consip.db` ad ogni import.

### Could Have (Desiderabili - Release v1.2)
- [ ] Generazione guidata del DGUE elettronico (Busta A) e calcolo automatico del ribasso economico (Busta C).
- [ ] Notifiche desktop o email per gare a semaforo rosso (< 3 giorni dal termine).
- [ ] Integrazione con calendario locale (file `.ics` esportabile per le scadenze dei bandi).

### Won't Have (Fuori Scopo Attuale - Rimandati a v2.0+)
- Multi-tenancy SaaS cloud enterprise.
- Firma digitale remota integrata (si raccomanda l'uso dei software di firma proprietari come Dike o ArubaSign).

---

## 4. Obiettivi Strategici e Risultati Chiave (OKR)

### Obiettivo 1 (O1): Stabilità Architetturale & Sincronizzazione Dati
- **KR 1.1**: Latenza di lettura/scrittura da UI su `gare_consip.db` inferiore a 50ms per record singolo.
- **KR 1.2**: Zero dipendenze terze (`pip install`) per l'avvio standard del server locale Python.
- **KR 1.3**: Persistenza al 100% delle modifiche anche in caso di crash o chiusura improvvisa del browser.

### Obiettivo 2 (O2): Efficienza Operativa & Fluidità UI/UX
- **KR 2.1**: Tempo di caricamento e rendering su dataset di 10.000 righe inferiore a 200ms grazie alla paginazione.
- **KR 2.2**: Tempo di aggiornamento stato gara tramite Drag-and-Drop Kanban ridotto da 4 click a 1 singolo gesto.
- **KR 2.3**: Score di vulnerabilità XSS ridotto a zero tramite escaping sistematico di tutte le stringhe utente.

### Obiettivo 3 (O3): Aderenza ai Processi di Gara MePA / Consip
- **KR 3.1**: Tracciamento trasparente del 100% dei campi essenziali ANAC (CIG, Stazione Appaltante, Importo, Scadenza, Categoria merceologica, Fase).
- **KR 3.2**: Riconoscimento automatico del settore merceologico (IT, Cancelleria, Sanità, Arredi, Energia) con accuratezza superiore al 95%.

---

## 5. Fasi di Rilascio e Roadmap Temporale

```
+-------------------------------------------------------------------------+
| FASE 1: Core Full-Stack & UI/UX Fix (v1.0) - ATTUALE                    |
| - Server REST Python nativo & Generazione gare_consip.db                |
| - Connessione Frontend/Backend bidirezionale                            |
| - Paginazione, Debounce, Drag-and-Drop Kanban, Anti-XSS                 |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| FASE 2: Automazione Ingestion & Note Relazionali (v1.1)                 |
| - Sincronizzazione automatica tramite endpoint CKAN dati.consip.it       |
| - Tabella note e storico avanzamento di fase                            |
| - Esportazione reportistica avanzata (.xlsx, .pdf stampa)               |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| FASE 3: Toolkit Documentale 3 Buste & Notifiche (v1.2)                  |
| - Generatore checklist Busta A (DGUE, Fideiussioni, PassOE)             |
| - Calcolatore soglia anomalia e ribasso Busta C                         |
| - Integrazione calendario scadenze .ics                                 |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| FASE 4: Collaboration & Cloud Hybrid Sync (v2.0)                        |
| - Supporto multi-postazione locale (LAN condivisa)                      |
| - Audit log conforme Linee Guida AgID / ANAC                            |
+-------------------------------------------------------------------------+
```

---

## 6. Criteri di Accettazione e Verifica Qualità (QA Gate)
1. **Verifica Database**: Il file `gare_consip.db` deve essere conforme a SQLite 3 standard e consultabile con `sqlite3`, DBeaver o DB Browser for SQLite.
2. **Verifica Live Sync**: Modificando o inserendo una gara dal browser a server attivo, la riga deve risultare immediatamente inserita nel file fisico `gare_consip.db`.
3. **Verifica Offline**: Staccando la connessione di rete e aprendo il file `.html` in locale, l'applicazione deve avviarsi regolarmente e permettere l'import e l'export manuale senza errori bloccanti in console.
4. **Verifica Sicurezza**: Nessun tag `<script>` o payload HTML inserito nel titolo o nel CIG deve essere interpretato dal browser.
