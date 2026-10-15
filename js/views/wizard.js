/**
 * MePA & Consip Desk Pro - Wizard Deterministico Partecipazione Gara
 * Aderente ai principi D.Lgs. 36/2023, Spec-Driven Design (sddesign) e dual-handoff (manuale / browser-use agent).
 * 
 * Include:
 * - Guida operativa contestuale su ogni singolo campo e fase (pulsanti interattivi '?')
 * - Modalità guidata con banner operativo chiaro "Cosa fare in questa fase"
 * - Calcoli automatici (scadenze, ribasso %, manodopera art. 108, garanzie art. 106)
 * - Dual hand-off: copia negli appunti formattata per portale Consip & JSON payload per agenti
 * - Persistenza su SQLite 3 (tabella gare_workflow)
 */

// Stato locale del Wizard
let currentWizardGaraId = null;
let currentWizardStep = 1;
let currentWizardData = {
  gara_id: null,
  current_step: 1,
  step1_data: {},
  step2_data: {},
  step3_data: {},
  step4_data: {}
};

/**
 * Dizionario enciclopedico di supporto interattivo per ogni funzionalità e campo del Wizard
 */
const WIZARD_HELP_GUIDE = {
  general_wizard: {
    category: "GUIDA GENERALE AL WORKFLOW",
    title: "Come Funziona il Wizard Deterministico MePA",
    what: "Il Wizard è una pipeline operativa in 4 fasi che traduce le regole di partecipazione del Nuovo Codice degli Appalti (D.Lgs. 36/2023) e del portale AcquistinretePA in un flusso sequenziale a prova di errore.",
    portal_location: "Portale www.acquistinretepa.it -> Sezione 'Gare e RdO' -> Gestione Partecipazione.",
    what_to_do: "Segui le 4 fasi in ordine: 1) Registra gli identificativi e verifica i termini di chiarimento. 2) Esegui la delibera Go/No-Go per non sprecare risorse. 3) Prepara e firma le 3 Buste (Amministrativa, Tecnica, Economica). 4) Traccia l'esito e richiedi lo svincolo fideiussione.",
    legal_tip: "Il rispetto rigoroso della separazione delle buste e dei termini perentori di invio offerta e quesiti previene il 100% dei motivi di esclusione formale."
  },
  cig: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Codice Identificativo Gara (CIG)",
    what: "È il codice alfanumerico univoco di 10 caratteri rilasciato da ANAC che individua l'appalto pubblico in tutta la documentazione ufficiale e nei registri contabili.",
    portal_location: "In cima alla scheda bando su acquistinretepa.it, sotto il titolo della RdO o nel disciplinare di gara.",
    what_to_do: "Verifica che il CIG corrisponda esattamente a quello del bando. Usa il pulsante 'Copia' per cercarlo all'interno di ANAC FVOE 2.0 o sul portale Consip.",
    legal_tip: "Nelle procedure sotto i 5.000€ o micro-acquisti può presentarsi come SmartCIG. Il CIG ordinario di 10 caratteri è obbligatorio per l'emissione del PassOE/FVOE 2.0."
  },
  qa_deadline: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Termine per Richiesta Chiarimenti (Q&A)",
    what: "È la data e ora limite entro cui i concorrenti possono porre quesiti alla Stazione Appaltante su clausole oscure, incongruenze o richieste tecniche.",
    portal_location: "Scheda 'Date della Procedura' della RdO su AcquistinretePA o capitolo 'Chiarimenti' del Disciplinare.",
    what_to_do: "Imposta la data. Se mancano meno di 3 giorni, invia immediatamente i quesiti tramite il portale Consip (sezione Chiarimenti). I chiarimenti inviati via PEC o fuori termine vengono dichiarati inammissibili.",
    legal_tip: "Ai sensi dell'art. 88 D.Lgs. 36/2023, le risposte ai chiarimenti della PA diventano parte integrante della lex specialis di gara."
  },
  deadline: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Termine Perentorio Presentazione Offerta",
    what: "La scadenza improrogabile di sistema entro cui tutte e 3 le buste devono essere caricate, firmate digitalmente e inviate a sistema MePA.",
    portal_location: "Evidenziata in rosso su acquistinretepa.it e all'art. 1 del Disciplinare.",
    what_to_do: "Pianifica l'invio finale almeno 24-48 ore prima della scadenza. I blocchi dei server Consip o rallentamenti della connessione nell'ultima ora non giustificano la riammissione.",
    legal_tip: "Il termine di scadenza offerta è perentorio a pena di decadenza automatica stabilito dall'art. 92 D.Lgs. 36/2023."
  },
  authority: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Stazione Appaltante / Ente Pubblico",
    what: "L'amministrazione pubblica (Comune, Ministero, ASL, Università) che ha indetto la procedura concorsuale.",
    portal_location: "Intestazione della scheda bando su MePA.",
    what_to_do: "Verifica che l'ente rientri tra le amministrazioni verso cui l'azienda può emettere fattura elettronica e non abbia contenziosi aperti.",
    legal_tip: "Verifica nel disciplinare se l'ente appalta per sé o come centrale di committenza qualificata ex art. 62 D.Lgs. 36/2023."
  },
  rup_name: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Responsabile Unico del Progetto (RUP)",
    what: "Il funzionario pubblico nominato dalla Stazione Appaltante responsabile di tutte le fasi dell'appalto.",
    portal_location: "Disciplinare di gara, art. 'Responsabile del Progetto' o 'Contatti'.",
    what_to_do: "Inserisci il nome e la qualifica del RUP. Ti servirà per intestare eventuali comunicazioni formali, istanze di soccorso istruttorio o PEC di richiesta svincolo polizze.",
    legal_tip: "Ai sensi dell'art. 15 D.Lgs. 36/2023, il RUP è l'unico interlocutore istituzionale per la procedura."
  },
  title: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Oggetto della Fornitura / Servizio",
    what: "Descrizione sintetica delle prestazioni richieste dalla PA (beni, servizi informatici, manutenzione, lavori).",
    portal_location: "Titolo principale del bando o art. 'Oggetto dell'Appalto' nel Disciplinare.",
    what_to_do: "Leggilo con attenzione per verificare la compatibilità con i codici ATECO e l'oggetto sociale della tua azienda.",
    legal_tip: "L'offerta tecnica ed economica deve corrispondere fedelmente all'oggetto; varianti non ammesse portano all'esclusione."
  },
  check_fatturato: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Fatturato Specifico nel Settore",
    what: "Requisito di capacità economico-finanziaria: la stazione appaltante può richiedere un fatturato minimo maturato negli ultimi 3 esercizi finanziari.",
    portal_location: "Disciplinare di Gara -> Sezione 'Requisiti di partecipazione economico-finanziari'.",
    what_to_do: "Controlla i bilanci approvati dell'azienda. Se il fatturato aziendale non è sufficiente, valuta se partecipare in Raggruppamento Temporaneo di Imprese (RTI) o ricorrere all'Avvalimento.",
    legal_tip: "L'art. 100 del D.Lgs. 36/2023 stabilisce che il fatturato specifico richiesto non può superare il doppio del valore stimato dell'appalto."
  },
  check_iso: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Certificazioni di Qualità e CAM",
    what: "Certificati aziendali (ISO 9001, ISO 27001, ISO 14001) e rispetto dei Criteri Ambientali Minimi (CAM) previsti per legge.",
    portal_location: "Disciplinare di Gara -> Sezione 'Requisiti di idoneità professionale e CAM'.",
    what_to_do: "Verifica che i certificati siano in corso di validità e intestati alla ragione sociale partecipante. La certificazione ISO 9001 dà diritto allo sconto del 50% sulla cauzione provvisoria!",
    legal_tip: "I Criteri Ambientali Minimi (art. 57 D.Lgs. 36/2023) sono obbligatori per legge per tutte le forniture della Pubblica Amministrazione."
  },
  check_sopralluogo: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Sopralluogo Obbligatorio (ove previsto)",
    what: "Ispezione fisica o virtuale dei luoghi di esecuzione del servizio/lavoro prima dell'invio dell'offerta.",
    portal_location: "Disciplinare di Gara -> Sezione 'Sopralluogo'.",
    what_to_do: "Verifica se il disciplinare lo prescrive come obbligatorio a pena di esclusione. In tal caso, richiedi l'appuntamento con congruo anticipo e conserva l'Attestato rilasciato dal RUP.",
    legal_tip: "Se obbligatorio, la mancata effettuazione o la mancanza dell'attestato nella Busta A comporta l'esclusione non sanabile con soccorso istruttorio."
  },
  check_garanzie: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Castelletto Garanzie Fideiussorie",
    what: "Verifica della disponibilità del fido presso la banca o compagnia assicurativa per emettere la Garanzia Provvisoria (1-2% dell'importo).",
    portal_location: "Contatto con il proprio broker o istituto bancario convenzionato.",
    what_to_do: "Spunta solo se hai già confermato con la compagnia garante che il massimale è capiente e che la polizza digitale conforme allo schema tipo ANAC può essere rilasciata in tempo.",
    legal_tip: "La polizza fideiussoria deve contenere espressamente l'impegno a rilasciare la cauzione definitiva in caso di aggiudicazione (art. 106 c. 5)."
  },
  margin_pct: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Margine Operativo Netto Stimato (%)",
    what: "Percentuale di utile lordo/netto che l'azienda intende ricavare dalla commessa detratte tutte le spese vive di acquisto e manodopera.",
    portal_location: "Calcolo interno dell'ufficio gare / Business Plan di commessa.",
    what_to_do: "Imposta il margine desiderato. Un margine sotto l'8% in appalti complessi aumenta il rischio di anomalia o di perdite operative durante l'esecuzione.",
    legal_tip: "Le offerte con marginalità eccessivamente compressa rischiano di incorrere nella verifica di anomalia dell'offerta ex art. 110 D.Lgs. 36/2023."
  },
  go_decision: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Delibera Strategica Go / No-Go",
    what: "La decisione formale dell'ufficio gare: investire tempo ed energie per partecipare (GO), scartare la procedura (NO-GO), oppure attendere risposta ai chiarimenti (PENDING).",
    portal_location: "Decisione interna aziendale da registrare nel gestionale.",
    what_to_do: "Seleziona 'GO' solo se tutti i requisiti sono soddisfatti e il margine è sostenibile. Se mancano requisiti insuperabili, seleziona 'NO-GO' per archiviare la gara ed evitare sprechi.",
    legal_tip: "Il filtro Go/No-Go riduce del 40% i costi amministrativi dell'ufficio gare massimizzando la percentuale di successo (win rate)."
  },
  step2_notes: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Note Strategiche e Consorzi/Subappalto",
    what: "Spazio per annotare accordi con partner per RTI (Raggruppamento Temporaneo), contratti di avvalimento o quote di subappalto da indicare.",
    portal_location: "Archivio interno gare.",
    what_to_do: "Scrivi gli estremi delle quote percentuali di fornitura tra mandataria e mandante o note sul fornitore principale.",
    legal_tip: "Nel nuovo codice 36/2023 non vi è più il tetto rigido del 30% per il subappalto, ma la stazione appaltante può indicare prestazioni non subappaltabili."
  },
  buste_overview: {
    category: "FASE 3: LE 3 BUSTE TELEMATICHE",
    title: "Regola di Separazione delle 3 Buste (D.Lgs. 36/2023)",
    what: "Il portale MePA richiede di caricare 3 buste elettroniche distinte: Busta A (Documenti Amministrativi), Busta B (Progetto Tecnico), Busta C (Offerta di Prezzo).",
    portal_location: "Portale www.acquistinretepa.it -> Wizard di sottomissione offerta della RdO.",
    what_to_do: "Clicca sui 3 tab (A, B, C) per visualizzare i documenti e i file specifici richiesti per ciascuna busta. Assicurati che ogni file sia firmato digitalmente in formato CAdES (.p7m).",
    legal_tip: "DIVIETO DI COMMISTIONE: Nessun elemento di prezzo (cifre in euro, percentuali di sconto) deve MAI essere inserito nella Busta A o Busta B, a pena di ESCLUSIONE AUTOMATICA non sanabile!"
  },
  busta_a_dgue: {
    category: "FASE 3: BUSTA A AMMINISTRATIVA",
    title: "DGUE Elettronico (ESPD XML/PDF)",
    what: "Il Documento di Gara Unico Europeo è l'autodichiarazione con cui l'operatore economico attesta il possesso dei requisiti di ordine generale (assenza di reati, regolarità fiscale e contributiva DURC).",
    portal_location: "Compilabile direttamente online nella sezione 'Busta Amministrativa' di AcquistinretePA oppure su portale ANAC.",
    what_to_do: "Compila tutti i quadri del DGUE sul portale, scarica il PDF generato, apponi la firma digitale CAdES del legale rappresentante (.pdf.p7m) e ricaricalo a sistema.",
    legal_tip: "La falsa dichiarazione nel DGUE comporta la segnalazione all'ANAC con annotazione nel Casellario Informatico e interdizione dalle gare."
  },
  busta_a_fideiussione: {
    category: "FASE 3: BUSTA A AMMINISTRATIVA",
    title: "Garanzia Provvisoria (art. 106 D.Lgs. 36/2023)",
    what: "Fideiussione bancaria o assicurativa a garanzia della serietà dell'offerta, pari di norma all'1% o 2% del valore dell'appalto.",
    portal_location: "Da allegare come file firmato digitalmente dal garante nella Busta Amministrativa su MePA.",
    what_to_do: "Verifica che la polizza contenga: 1) Rinuncia al beneficio della preventiva escussione; 2) Rinuncia all'eccezione ex art. 1957 c.c.; 3) Pagamento entro 15 giorni su richiesta della PA; 4) Impegno a rilasciare la cauzione definitiva in caso di vincita.",
    legal_tip: "Se possiedi la certificazione ISO 9001 hai diritto a ridurre l'importo della garanzia del 50%! Se hai anche ISO 14001, puoi cumulare un'ulteriore riduzione."
  },
  fvoe_passoe: {
    category: "FASE 3: BUSTA A AMMINISTRATIVA",
    title: "Fascicolo Virtuale FVOE 2.0 / PassOE ANAC",
    what: "Il codice generato sulla piattaforma ANAC (FVOE 2.0) che consente alla Stazione Appaltante di verificare i requisiti generali (DURC, casellario giudiziale, antimafia).",
    portal_location: "Portale dei Servizi ANAC -> Fascicolo Virtuale dell'Operatore Economico (FVOE 2.0).",
    what_to_do: "Inserisci il CIG su FVOE 2.0, associa la tua azienda e genera il documento di partecipazione. Incolla il codice identificativo in questo campo e allega il PDF nella Busta A.",
    legal_tip: "Dal 2024 il FVOE 2.0 ha sostituito completamente il vecchio PassOE cartaceo. Il codice deve essere attivo prima della scadenza del bando."
  },
  busta_a_files: {
    category: "FASE 3: BUSTA A AMMINISTRATIVA",
    title: "Nomenclatura File e Firma Digitale CAdES",
    what: "Elenco dei file amministrativi standard da caricare. Consip richiede file firmati digitalmente con estensione .pdf.p7m.",
    portal_location: "Sezione Allegati Busta A su MePA.",
    what_to_do: "Clicca su 'Copia Nome' accanto a ciascun file per rinominare i tuoi documenti PDF prima di firmarli con il tuo software di firma (Dike, ArubaSign, GoSign).",
    legal_tip: "Non usare caratteri speciali, lettere accentate o spazi nei nomi file; usa underscore (_) per evitare errori di caricamento sulla piattaforma."
  },
  busta_b_ready: {
    category: "FASE 3: BUSTA B TECNICA",
    title: "Relazione Tecnica Descrittiva",
    what: "Il documento principale in cui l'azienda illustra le caratteristiche qualitative dei beni o servizi offerti, il piano organizzativo e le migliorie.",
    portal_location: "Caricamento nella sezione 'Busta Tecnica' su AcquistinretePA.",
    what_to_do: "Spunta quando la relazione tecnica è stata redatta e impaginata rispettando rigorosamente il numero massimo di facciate (pagine) e la dimensione carattere imposti dal disciplinare.",
    legal_tip: "Le pagine eccedenti il limite stabilito dal disciplinare non vengono lette dalla Commissione Giudicatrice o possono portare all'esclusione."
  },
  busta_b_cam: {
    category: "FASE 3: BUSTA B TECNICA",
    title: "Criteri Ambientali Minimi (CAM) & Punteggio Tecnico",
    what: "Dichiarazioni e schede tecniche dei produttori attestanti la conformità del prodotto ai criteri ecologici ministeriali.",
    portal_location: "Allegati tecnici Busta B su MePA.",
    what_to_do: "Allega schede tecniche ufficiali, marchi ecolabel o dichiarazioni di conformità per ottenere il massimo punteggio tecnico discrezionale o tabellare.",
    legal_tip: "I CAM consentono di accumulare premialità decisive per vincere l'appalto con criterio dell'offerta economicamente più vantaggiosa (OEPV)."
  },
  busta_b_files: {
    category: "FASE 3: BUSTA B TECNICA",
    title: "File Busta Tecnica (.p7m)",
    what: "I file contenenti l'offerta tecnica e le schede prodotto, da firmare in formato digitale CAdES.",
    portal_location: "Sezione Busta Tecnica su MePA.",
    what_to_do: "Copia il nome file standardizzato e rinomina il documento prima della firma digitale.",
    legal_tip: "Rammenta il divieto di commistione: nessun file della Busta Tecnica deve contenere i prezzi o le percentuali di sconto applicate!"
  },
  busta_c_base: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Base d'Asta (€)",
    what: "L'importo economico massimo stimato dalla Stazione Appaltante a base di gara su cui formulare il ribasso percentuale.",
    portal_location: "Scheda economica della RdO su MePA o bando di gara.",
    what_to_do: "È precaricata in automatico dal gestionale. Qualsiasi offerta economica con valore superiore alla base d'asta viene esclusa automaticamente.",
    legal_tip: "Ai sensi dell'art. 108, le offerte in rialzo rispetto alla base d'asta sono inammissibili per legge."
  },
  busta_c_discount: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Ribasso Percentuale Offerto (%)",
    what: "La percentuale di sconto che l'azienda offre rispetto all'importo a base di gara.",
    portal_location: "Campo 'Ribasso Percentuale' o 'Prezzo a Corpo' nel form economico di AcquistinretePA.",
    what_to_do: "Digita la percentuale (es. 6.50). Il Wizard ricalcola istantaneamente il Prezzo Netto Offerto in euro senza che tu debba fare calcoli manuali.",
    legal_tip: "Nei bandi con criterio del prezzo più basso viene applicata l'esclusione automatica delle offerte anomale secondo i metodi di calcolo dell'allegato II.2 al Codice."
  },
  busta_c_price: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Prezzo Netto Offerto (IVA esclusa)",
    what: "La cifra totale in euro risultante dall'applicazione del ribasso percentuale alla base d'asta.",
    portal_location: "Modulo offerta economica generato su MePA.",
    what_to_do: "Usa il tasto 'Copia Cifra' per incollare l'importo esatto nel form di compilazione del portale Consip.",
    legal_tip: "L'importo inserito a sistema fa fede rispetto a qualsiasi altra indicazione verbale. Verifica sempre l'esatta corrispondenza tra cifre e decimali."
  },
  busta_c_manodopera: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Costi della Manodopera (art. 108 c. 9)",
    what: "La quota del prezzo totale offerto che l'azienda destina ai costi del personale impiegato per l'esecuzione della commessa.",
    portal_location: "Campo obbligatorio nel modello di offerta economica su MePA.",
    what_to_do: "Inserisci l'importo della manodopera calcolato sulle tabelle ministeriali del costo orario del lavoro. Non può essere pari a zero!",
    legal_tip: "La mancata indicazione dei costi della manodopera comporta l'esclusione automatica della gara (art. 108 c. 9 D.Lgs. 36/2023) non sanabile con soccorso istruttorio!"
  },
  busta_c_sicurezza: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Oneri Aziendali per la Salute e Sicurezza",
    what: "Le spese specifiche che la tua azienda sostiene per adempiere agli obblighi di sicurezza sul lavoro dei propri addetti (DPI, visite mediche, formazione D.Lgs. 81/08).",
    portal_location: "Campo dedicato nel form dell'offerta economica MePA.",
    what_to_do: "Inserisci la stima dei costi aziendali della sicurezza. Attenzione: non confonderli con i 'costi della sicurezza da interferenze (DUVRI)' che sono stabiliti dalla PA!",
    legal_tip: "La mancata indicazione degli oneri aziendali di sicurezza comporta l'esclusione insanabile ex art. 108 c. 9."
  },
  busta_c_files: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "File Offerta Economica MePA",
    what: "Il modello PDF generato dal portale AcquistinretePA contenente il ribasso e i prezzi unitari, da scaricare, firmare e ricaricare.",
    portal_location: "Sezione Busta Economica su MePA.",
    what_to_do: "Scarica il PDF dal portale MePA solo dopo aver inserito i prezzi, firmalo con la tua smart card / token USB e ricaricalo con estensione .p7m.",
    legal_tip: "Non apportare modifiche grafiche al PDF generato dal MePA, limitati ad apporre la firma digitale valida."
  },
  fase4_outcome: {
    category: "FASE 4: ESITO & POST-GARA",
    title: "Stato Aggiudicazione ed Esito Gara",
    what: "Registrazione ufficiale dell'esito della procedura (Vinta, Persa, o In Valutazione durante la seduta di gara).",
    portal_location: "Verbale di gara pubblicato su AcquistinretePA o comunicazione PEC della Stazione Appaltante.",
    what_to_do: "Aggiorna lo stato nel menu a tendina. Questo aggiornerà automaticamente anche il Cruscotto KPI e il database SQLite.",
    legal_tip: "Se la gara è vinta, la Stazione Appaltante chiederà la costituzione della Garanzia Definitiva (art. 117 D.Lgs. 36/2023)."
  },
  fase4_svincolo: {
    category: "FASE 4: ESITO & POST-GARA",
    title: "Lettera di Svincolo Cauzione Provvisoria",
    what: "La dichiarazione liberatoria che la Stazione Appaltante deve rilasciare ai concorrenti non aggiudicatari per estinguere la polizza fideiussoria.",
    portal_location: "Richiesta da inviare via PEC al RUP indicato nella Fase 1.",
    what_to_do: "Se la gara non è stata vinta o sono trascorsi i termini di validità dell'offerta, invia una PEC al RUP richiedendo lo svincolo formale della garanzia per ripristinare il castelletto assicurativo.",
    legal_tip: "Ai sensi dell'art. 106 c. 10, la garanzia cessa automaticamente con l'aggiudicazione definitiva, ma gli istituti bancari esigono la quietanza scritta o PEC del RUP."
  },
  fase4_notes: {
    category: "FASE 4: ESITO & POST-GARA",
    title: "Verbale di Gara e Graduatoria",
    what: "Annotazione del punteggio ottenuto, del vincitore e del ribasso vincente per l'archivio aziendale di intelligence di mercato.",
    portal_location: "Verbale di gara scaricabile dall'area comunicazioni della RdO.",
    what_to_do: "Trascrivi i punteggi tecnici ed economici delle aziende concorrenti per affinare la strategia di ribasso nelle gare successive.",
    legal_tip: "Entro 30 giorni dalla comunicazione dell'aggiudicazione decorrono i termini per l'eventuale ricorso al TAR ex art. 120 c.p.a."
  },
  dock_copy_portal: {
    category: "SISTEMA DUAL HAND-OFF",
    title: "Copia Dati per Portale Consip (Modalità Manuale)",
    what: "Estrae tutti i parametri elaborati nella fase corrente e li copia negli appunti di sistema in un formato compatto.",
    portal_location: "Da incollare direttamente nei campi corrispondenti di www.acquistinretepa.it.",
    what_to_do: "Clicca il pulsante quando stai compilando manualmente la procedura sul sito Consip. Incolla i valori con Ctrl+V senza dover riscrivere cifre o codici a mano.",
    legal_tip: "Previene errori umani di digitazione su CIG, codici FVOE o importi al centesimo."
  },
  dock_agent_payload: {
    category: "SISTEMA DUAL HAND-OFF",
    title: "Payload Agente Autonomo (Modalità Browser-Use)",
    what: "Genera un oggetto JSON standardizzato contenente l'intero stato della procedura di gara, le credenziali dei file e i parametri economici.",
    portal_location: "Utilizzato da agenti AI autonomi (script Python con libreria browser-use, Playwright o Puppeteer).",
    what_to_do: "Clicca per aprire la finestra di anteprima. Puoi copiare il JSON o scaricare il file .json per passarlo direttamente all'agente che compilerà il portale Consip automaticamente.",
    legal_tip: "Conforme agli standard di interoperabilità per automazione d'ufficio gare."
  },
  dock_save: {
    category: "PERSISTENZA SQLITE 3",
    title: "Salvataggio Avanzamento nel Database",
    what: "Memorizza lo stato di tutte e 4 le fasi nella tabella relazionale 'gare_workflow' del database locale 'gare_consip.db'.",
    portal_location: "Server locale SQLite 3 (porta 8050).",
    what_to_do: "Clicca in qualsiasi momento per essere certo che i dati inseriti non vadano persi alla chiusura del browser. Anche il pulsante 'Conferma & Avanza' esegue il salvataggio automatico.",
    legal_tip: "Garantisce conformità alle direttive di conservazione del fascicolo di gara aziendale."
  }
};

/**
 * Genera il pulsantino informativo interattivo '?' con tooltip contestuale
 */
window.renderHelpBtn = function(key) {
  return `
    <button type="button" 
            onclick="window.showWizardHelpModal('${key}'); event.stopPropagation();" 
            class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-cyan-400 text-[10px] font-bold border border-slate-700 hover:border-cyan-400 transition-all cursor-pointer ml-1.5 shadow-sm shrink-0" 
            title="Clicca per visualizzare la guida operativa e normativa">
      ?
    </button>
  `;
};

/**
 * Mostra la modale informativa interattiva con dettagli operativi e legali
 */
window.showWizardHelpModal = function(key) {
  const item = WIZARD_HELP_GUIDE[key] || {
    category: "GUIDA OPERATIVA",
    title: "Informazione di Dettaglio",
    what: "Funzionalità o campo del Wizard di partecipazione gara.",
    portal_location: "Portale www.acquistinretepa.it",
    what_to_do: "Verifica e compila il campo con i dati ufficiali di gara.",
    legal_tip: "Segui le prescrizioni del disciplinare di gara."
  };

  let modal = document.getElementById("wizardHelpModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "wizardHelpModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-sm">ℹ</span>
          <div>
            <span class="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold block">${escapeHtml(item.category)}</span>
            <h3 class="text-sm sm:text-base font-bold text-white">${escapeHtml(item.title)}</h3>
          </div>
        </div>
        <button onclick="document.getElementById('wizardHelpModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
      </div>

      <div class="space-y-3.5 text-xs text-slate-300 overflow-y-auto custom-scrollbar pr-1 flex-1 leading-relaxed">
        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <strong class="text-cyan-300 font-mono text-[11px] uppercase block">📌 A cosa serve questo campo / operazione:</strong>
          <p>${escapeHtml(item.what)}</p>
        </div>

        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <strong class="text-amber-300 font-mono text-[11px] uppercase block">🌐 Dove lo trovi su www.acquistinretepa.it:</strong>
          <p>${escapeHtml(item.portal_location)}</p>
        </div>

        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <strong class="text-emerald-300 font-mono text-[11px] uppercase block">⚡ Cosa devi fare esattamente adesso:</strong>
          <p>${escapeHtml(item.what_to_do)}</p>
        </div>

        <div class="bg-cyan-950/30 p-3.5 rounded-xl border border-cyan-800/40 text-cyan-200 space-y-1">
          <strong class="text-cyan-400 font-mono text-[11px] uppercase block">⚖️ Norma &amp; Suggerimento Ufficio Gare:</strong>
          <p>${escapeHtml(item.legal_tip)}</p>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-800 flex items-center justify-between">
        <span class="text-[11px] text-slate-500 font-mono">D.Lgs. 36/2023 &bull; Acquisti in Rete PA</span>
        <button onclick="document.getElementById('wizardHelpModal').classList.add('hidden')" class="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition">
          Ho capito, chiudi
        </button>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
};

/**
 * Avvia o apre il Wizard per una specifica gara (o la prima attiva se null)
 * Di default apre sempre la Fase 1 per guidare l'operatore dall'inizio.
 */
window.openTenderWizard = async function(garaId = null, forcedStep = 1) {
  const all = getAllTendersFromSQLite();
  if (all.length === 0) {
    showNotification("Nessuna gara presente. Carica dati demo o una gara per usare il Wizard.", false);
    return;
  }

  let tender = null;
  if (garaId) {
    tender = all.find(t => t.id === garaId || t.cig === garaId);
  }
  if (!tender) {
    // Preferisci una gara attiva (con scadenza futura) o la demo T1, altrimenti la prima disponibile
    tender = all.find(t => t.id === 'T1') || all.find(t => new Date(t.deadline) > new Date()) || all[0];
  }

  currentWizardGaraId = tender.id;
  window.switchView("wizard");

  await loadWizardData(currentWizardGaraId, tender);

  // Garantisce che il Wizard parta sempre dalla Fase 1 (o dal passo richiesto)
  if (forcedStep !== null && forcedStep !== undefined) {
    currentWizardStep = forcedStep;
  } else {
    currentWizardStep = currentWizardData.current_step || 1;
  }

  renderWizardView(tender);
};

/**
 * Carica lo stato del workflow dal backend o da cache locale
 */
async function loadWizardData(garaId, tender) {
  currentWizardData = {
    gara_id: garaId,
    current_step: 1,
    step1_data: {
      cig: tender.cig || "",
      authority: tender.authority || "",
      title: tender.title || "",
      category: tender.category || "IT",
      region: tender.region || "Nazionale",
      amount: tender.amount || 0,
      deadline: tender.deadline || "",
      rup_name: "",
      qa_deadline: tender.deadline ? tender.deadline.split("T")[0] : "",
      link: tender.link || "https://www.acquistinretepa.it"
    },
    step2_data: {
      check_fatturato: false,
      check_iso: false,
      check_sopralluogo: false,
      check_garanzie: false,
      margin_estimated_pct: 12.5,
      go_decision: "GO",
      notes: ""
    },
    step3_data: {
      active_busta: "A",
      busta_a_dgue_ready: false,
      busta_a_fideiussione_ready: false,
      busta_a_fideiussione_importo: Math.round((tender.amount || 0) * 0.01),
      busta_a_fvoe_passoe: "",
      busta_a_files: [
        `CIG_${tender.cig || 'BANDO'}_BustaA_DGUE.pdf.p7m`,
        `CIG_${tender.cig || 'BANDO'}_BustaA_GaranziaProvvisoria.pdf.p7m`,
        `CIG_${tender.cig || 'BANDO'}_BustaA_DichiarazioniIntegrative.pdf.p7m`
      ],
      busta_b_ready: false,
      busta_b_criteri_cam: true,
      busta_b_files: [
        `CIG_${tender.cig || 'BANDO'}_BustaB_OffertaTecnica.pdf.p7m`,
        `CIG_${tender.cig || 'BANDO'}_BustaB_SchedeProdotti.pdf.p7m`
      ],
      busta_c_ready: false,
      busta_c_base_amount: tender.amount || 0,
      busta_c_discount_pct: 5.5,
      busta_c_offered_price: (tender.amount || 0) * (1 - 0.055),
      busta_c_manodopera: Math.round((tender.amount || 0) * 0.25),
      busta_c_sicurezza: Math.round((tender.amount || 0) * 0.02),
      busta_c_files: [
        `CIG_${tender.cig || 'BANDO'}_BustaC_OffertaEconomica.pdf.p7m`
      ]
    },
    step4_data: {
      outcome: tender.status === "Vinta" ? "Vinta" : (tender.status === "Persa" ? "Persa" : "In Valutazione"),
      fideiussione_svincolata: false,
      note_conclusive: ""
    }
  };

  if (liveBackendConnected && typeof Api !== "undefined" && Api.getWorkflow) {
    try {
      const remote = await Api.getWorkflow(garaId);
      if (remote && remote.gara_id) {
        currentWizardData.current_step = remote.current_step || 1;
        if (remote.step1_data && Object.keys(remote.step1_data).length > 0) currentWizardData.step1_data = remote.step1_data;
        if (remote.step2_data && Object.keys(remote.step2_data).length > 0) currentWizardData.step2_data = remote.step2_data;
        if (remote.step3_data && Object.keys(remote.step3_data).length > 0) currentWizardData.step3_data = remote.step3_data;
        if (remote.step4_data && Object.keys(remote.step4_data).length > 0) currentWizardData.step4_data = remote.step4_data;
      }
    } catch (e) {
      console.warn("Nessun workflow salvato nel backend, uso defaults:", e);
    }
  }

  currentWizardStep = currentWizardData.current_step || 1;
}

/**
 * Salva lo stato del workflow nel backend e aggiorna la UI
 */
window.saveCurrentWizardState = async function() {
  readInputsFromWizardDOM();

  currentWizardData.current_step = currentWizardStep;
  currentWizardData.updated_at = new Date().toISOString();

  if (liveBackendConnected && typeof Api !== "undefined" && Api.saveWorkflow) {
    try {
      await Api.saveWorkflow(currentWizardData);
    } catch (e) {
      console.error("Errore salvataggio workflow su backend:", e);
    }
  }

  showNotification("Avanzamento del Workflow memorizzato in SQLite 3.");
};

/**
 * Renderizza l'intera schermata del Wizard con UI rinnovata, accessibile e interattiva
 */
function renderWizardView(tender) {
  const container = document.getElementById("view-wizard");
  if (!container) return;

  const rem = calculateTimeRemaining(tender.deadline);
  
  // Step definitions con stato calcolato
  const s2 = currentWizardData.step2_data;
  const s3 = currentWizardData.step3_data;
  const s4 = currentWizardData.step4_data;

  const stepStatus = [
    { num: 1, title: "1. Identificazione", sub: "CIG & Scadenze Portale", statusText: currentWizardStep > 1 ? "Completato" : "In compilazione", badge: "bg-cyan-500/10 text-cyan-400" },
    { num: 2, title: "2. Qualificazione", sub: "Idoneità Go / No-Go", statusText: s2.go_decision === 'GO' ? "Deliberato: GO" : (s2.go_decision === 'NO_GO' ? "Scartata: NO-GO" : "Da valutare"), badge: s2.go_decision === 'GO' ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400" },
    { num: 3, title: "3. Le 3 Buste", sub: "Busta A, B & C", statusText: s3.busta_a_dgue_ready ? "Buste avviate" : "Bozza da firmare", badge: "bg-purple-500/10 text-purple-400" },
    { num: 4, title: "4. Esito & Svincolo", sub: "Chiusura & Polizze", statusText: s4.outcome || "In attesa", badge: "bg-slate-500/10 text-slate-400" }
  ];

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- TOP COMMAND BAR & GARA SELECTION -->
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div class="flex items-start sm:items-center gap-3.5">
          <button onclick="window.switchView('cruscotto')" class="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition touch-target-action shrink-0" title="Torna al Cruscotto delle Gare">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded-md">WIZARD DETERMINISTICO MEPA</span>
              <span class="text-xs font-mono font-bold text-white bg-slate-950 px-2.5 py-0.5 rounded-md border border-slate-800">${escapeHtml(tender.cig || 'CIG N/D')}</span>
              <button onclick="window.showWizardHelpModal('general_wizard')" class="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-cyan-400 text-[11px] font-semibold border border-slate-700 transition flex items-center gap-1">
                <span>Come funziona?</span>
                <span class="font-bold">?</span>
              </button>
            </div>
            <h2 class="text-sm sm:text-base font-bold text-white tracking-tight truncate max-w-xl md:max-w-2xl">${escapeHtml(tender.title || 'Procedura di gara')}</h2>
            <div class="text-xs text-slate-400 font-mono flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>🏛️ ${escapeHtml(tender.authority || 'Ente')}</span>
              <span>💶 <strong class="text-emerald-400 font-semibold">${formatEUR(tender.amount)}</strong></span>
              <span class="${rem.urgent ? 'text-rose-400 font-bold' : 'text-slate-300'}">⏰ ${rem.text}</span>
            </div>
          </div>
        </div>

        <!-- Selettore rapido di Gara & Salvataggio -->
        <div class="flex items-center gap-2.5 flex-wrap self-end lg:self-center">
          <div class="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-2xl px-3 py-1.5">
            <label class="text-[11px] text-slate-400 font-mono hidden sm:inline">Gara:</label>
            <select id="selectWizardTender" onchange="window.openTenderWizard(this.value)" class="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer">
              ${getAllTendersFromSQLite().map(t => `
                <option value="${escapeHtml(t.id)}" ${t.id === tender.id ? 'selected' : ''}>${escapeHtml(t.cig || t.id)} - ${escapeHtml(t.authority ? t.authority.substring(0, 18) : 'Gara')} (${formatEUR(t.amount)})</option>
              `).join('')}
            </select>
          </div>

          <button onclick="window.saveCurrentWizardState()" class="px-4 py-2 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-cyan-500/20">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
            <span>Salva Avanzamento</span>
          </button>
        </div>
      </div>

      <!-- STEPPER ORIZZONTALE CON STATO E FEEDBACK VISIVO -->
      <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-3 sm:p-4 shadow-md">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          ${stepStatus.map(s => {
            const isCompleted = s.num < currentWizardStep;
            const isCurrent = s.num === currentWizardStep;
            
            let cardBg = "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700";
            let badgeBg = "bg-slate-800 text-slate-400";
            
            if (isCurrent) {
              cardBg = "bg-cyan-950/40 border-cyan-500/60 text-white ring-1 ring-cyan-500/30";
              badgeBg = "bg-cyan-500 text-slate-950 font-black";
            } else if (isCompleted) {
              cardBg = "bg-emerald-950/20 border-emerald-500/40 text-emerald-200";
              badgeBg = "bg-emerald-500 text-slate-950 font-bold";
            }

            return `
              <button type="button" onclick="window.setWizardStep(${s.num})" class="text-left p-3.5 rounded-2xl border ${cardBg} transition flex items-center justify-between gap-3 group">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center font-mono text-xs ${badgeBg} shrink-0 transition-transform group-hover:scale-105">
                    ${isCompleted ? '✓' : s.num}
                  </div>
                  <div class="truncate">
                    <div class="text-xs font-bold leading-tight truncate text-white">${s.title}</div>
                    <div class="text-[10px] text-slate-400 truncate mt-0.5">${s.sub}</div>
                  </div>
                </div>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full ${s.badge} shrink-0 hidden md:inline-block">
                  ${s.statusText}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- WORK AREA DELLO STEP CORRENTE CON GUIDA OPERATIVA INTEGRATA -->
      <div id="wizardStepContent" class="space-y-6">
        ${renderCurrentStepContent(tender)}
      </div>

      <!-- DOCK AZIONI RAPIDE INFERIORE (NAVIGAZIONE & DUAL HAND-OFF) -->
      <div class="bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl sticky bottom-4 z-20">
        
        <!-- Pulsanti Spostamento Step -->
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <button onclick="window.setWizardStep(${Math.max(1, currentWizardStep - 1)})" ${currentWizardStep === 1 ? 'disabled' : ''} class="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed font-semibold text-xs transition border border-slate-700 flex items-center gap-1.5">
            <span>← Fase Precedente</span>
          </button>
          
          <button onclick="window.setWizardStep(${Math.min(4, currentWizardStep + 1)})" ${currentWizardStep === 4 ? 'disabled' : ''} class="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed font-semibold text-xs transition border border-slate-700 flex items-center gap-1.5">
            <span>Fase Successiva →</span>
          </button>
        </div>

        <!-- Tasti Dual Hand-Off & Avanzamento -->
        <div class="flex items-center gap-2.5 flex-wrap w-full sm:w-auto justify-end">
          
          <!-- Copia Rapida Portale (Manuale) con info -->
          <div class="flex items-center">
            <button onclick="window.copyStepValuesForPortal()" class="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-cyan-300 font-mono text-xs font-semibold transition flex items-center gap-2 shadow-sm" title="Copia negli appunti i parametri pronti per acquistinretepa.it">
              <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
              <span id="btnCopyStepLabel">Copia Dati per Portale Consip</span>
            </button>
            ${renderHelpBtn('dock_copy_portal')}
          </div>

          <!-- Payload Agente (Browser-Use) con info -->
          <div class="flex items-center">
            <button onclick="window.openAgentExportModal()" class="px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-900/50 to-indigo-900/50 hover:from-purple-900/70 hover:to-indigo-900/70 border border-purple-500/40 text-purple-200 font-mono text-xs font-semibold transition flex items-center gap-2 shadow-sm" title="Esporta JSON strutturato per automazione web">
              <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              <span>Payload Agente (Browser-Use)</span>
            </button>
            ${renderHelpBtn('dock_agent_payload')}
          </div>

          <!-- Conferma & Salva -->
          <button onclick="window.advanceStepAndSave()" class="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs transition flex items-center gap-2 shadow-lg shadow-cyan-500/25">
            <span>Conferma &amp; Avanza →</span>
          </button>
        </div>
      </div>

    </div>
  `;
}

/**
 * Renderizza i contenuti specifici dello step corrente (1, 2, 3 o 4)
 */
function renderCurrentStepContent(tender) {
  const d = currentWizardData;

  // -------------------------------------------------------------
  // FASE 1: IDENTIFICAZIONE E PRESA IN CARICO
  // -------------------------------------------------------------
  if (currentWizardStep === 1) {
    return `
      <!-- BANNER GUIDA DELLA FASE 1 -->
      <div class="bg-gradient-to-br from-cyan-950/50 via-slate-900 to-slate-950 border border-cyan-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between border-b border-cyan-500/20 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center">1</span>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>🎯 Cosa devi fare in questa Fase 1: Identificazione e Setup Bando</span>
              </h3>
              <span class="text-[11px] text-cyan-300 font-mono">D.Lgs. 36/2023 &bull; Termini di Chiarimento Q&A e Scadenza Offerte</span>
            </div>
          </div>
          <a href="${escapeHtml(d.step1_data.link || 'https://www.acquistinretepa.it')}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-mono inline-flex items-center gap-1.5 border border-slate-700 shadow-sm">
            <span>Apri su acquistinretepa.it ↗</span>
          </a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-cyan-400 block font-mono text-[11px] mb-1">Passo 1.1: Verifica il CIG</strong>
            <p class="text-slate-300 leading-relaxed">Controlla che il codice CIG a 10 caratteri corrisponda esattamente al bando pubblicato su MePA. Ti servirà per il FVOE 2.0 e la fideiussione.</p>
          </div>
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-amber-400 block font-mono text-[11px] mb-1">Passo 1.2: Termine Quesiti (Q&A)</strong>
            <p class="text-slate-300 leading-relaxed">Verifica quando scadono le richieste di chiarimento. Invia subito eventuali quesiti tecnici su MePA prima che scada il termine!</p>
          </div>
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-emerald-400 block font-mono text-[11px] mb-1">Passo 1.3: Assegna il RUP</strong>
            <p class="text-slate-300 leading-relaxed">Identifica il Responsabile Unico del Progetto indicato nel disciplinare per intestare garanzie e successive comunicazioni PEC.</p>
          </div>
        </div>
      </div>

      <!-- FORM SEZIONI FASE 1 -->
      <div class="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-5">
        <div class="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 pb-2 flex items-center justify-between">
          <span>Dati Ufficiali del Bando &amp; Cronoprogramma</span>
          <span class="text-[11px] text-slate-500 font-normal">Tutti i campi con (?) includono guida operativa</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
          <!-- CIG -->
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Codice Identificativo Gara (CIG):</span>
              ${renderHelpBtn('cig')}
            </label>
            <div class="flex gap-1.5">
              <input id="w_cig" type="text" value="${escapeHtml(d.step1_data.cig)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-cyan-400 font-mono font-bold text-xs focus:border-cyan-400">
              <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('w_cig').value); showNotification('CIG copiato negli appunti!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] shrink-0" title="Copia CIG">Copia</button>
            </div>
            <span class="text-[10px] text-slate-500 font-mono">Univoco ANAC per FVOE e cauzione</span>
          </div>

          <!-- Termine Domande Q&A -->
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Scadenza Chiarimenti (Q&A):</span>
              ${renderHelpBtn('qa_deadline')}
            </label>
            <input id="w_qa_deadline" type="date" value="${escapeHtml(d.step1_data.qa_deadline)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs focus:border-cyan-400">
            <span class="text-[10px] text-slate-500 font-mono">Quesiti oltre termine = inammissibili</span>
          </div>

          <!-- Scadenza Presentazione -->
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Scadenza Presentazione Offerta:</span>
              ${renderHelpBtn('deadline')}
            </label>
            <input id="w_deadline" type="datetime-local" value="${escapeHtml(d.step1_data.deadline ? d.step1_data.deadline.substring(0, 16) : '')}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-rose-300 font-mono font-bold text-xs focus:border-cyan-400">
            <span class="text-[10px] text-slate-500 font-mono">Termine perentorio non prorogabile</span>
          </div>

          <!-- Stazione Appaltante -->
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 md:col-span-2">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Stazione Appaltante / Amministrazione:</span>
              ${renderHelpBtn('authority')}
            </label>
            <input id="w_authority" type="text" value="${escapeHtml(d.step1_data.authority)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">
            <span class="text-[10px] text-slate-500 font-mono">Ente committente titolare del bando</span>
          </div>

          <!-- RUP -->
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>RUP (Responsabile Unico del Progetto):</span>
              ${renderHelpBtn('rup_name')}
            </label>
            <input id="w_rup_name" type="text" placeholder="Nome RUP dal disciplinare..." value="${escapeHtml(d.step1_data.rup_name || '')}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">
            <span class="text-[10px] text-slate-500 font-mono">Referente unico istituzionale</span>
          </div>

          <!-- Oggetto della Gara -->
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 md:col-span-3">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Oggetto Fornitura / Servizio:</span>
              ${renderHelpBtn('title')}
            </label>
            <textarea id="w_title" rows="2" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400 leading-relaxed">${escapeHtml(d.step1_data.title)}</textarea>
            <span class="text-[10px] text-slate-500 font-mono">Verifica piena conformità con i tuoi codici ATECO</span>
          </div>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // FASE 2: VALUTAZIONE IDONEITÀ & DELIBERA GO / NO-GO
  // -------------------------------------------------------------
  if (currentWizardStep === 2) {
    const s2 = d.step2_data;
    return `
      <!-- BANNER GUIDA DELLA FASE 2 -->
      <div class="bg-gradient-to-br from-amber-950/50 via-slate-900 to-slate-950 border border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between border-b border-amber-500/20 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center">2</span>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>🎯 Cosa devi fare in questa Fase 2: Valutazione Idoneità &amp; Delibera Go / No-Go</span>
              </h3>
              <span class="text-[11px] text-amber-300 font-mono">Analisi di Convenienza &bull; Checklist Requisiti Giuridici ed Economici</span>
            </div>
          </div>
          <button onclick="window.showWizardHelpModal('go_decision')" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-mono inline-flex items-center gap-1.5 border border-slate-700 shadow-sm">
            <span>Guida Delibera ?</span>
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-amber-400 block font-mono text-[11px] mb-1">Passo 2.1: Spunta la Checklist</strong>
            <p class="text-slate-300 leading-relaxed">Verifica se hai il fatturato triennale, le certificazioni ISO, se è obbligatorio il sopralluogo e se hai fido per la fideiussione.</p>
          </div>
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-emerald-400 block font-mono text-[11px] mb-1">Passo 2.2: Stima la Marginalità</strong>
            <p class="text-slate-300 leading-relaxed">Imposta il margine operativo netto stimato. Un margine sotto l'8% è ad alto rischio di perdita o anomalia dell'offerta.</p>
          </div>
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-cyan-400 block font-mono text-[11px] mb-1">Passo 2.3: Delibera Strategica</strong>
            <p class="text-slate-300 leading-relaxed">Seleziona 🟢 GO per proseguire con la preparazione delle buste, oppure 🔴 NO-GO per scartarla subito ed evitare sprechi.</p>
          </div>
        </div>
      </div>

      <!-- FORM SEZIONI FASE 2 -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        
        <!-- Checklist Requisiti con pulsantini info -->
        <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
          <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
            <span class="font-mono font-bold text-amber-400 uppercase text-xs">Checklist Requisiti Disciplinare</span>
            <span class="text-[10px] text-slate-500 font-mono">D.Lgs. 36/2023 art. 100</span>
          </div>

          <div class="space-y-3">
            <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_check_fatturato" type="checkbox" ${s2.check_fatturato ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
                <div class="flex-1">
                  <div class="flex items-center">
                    <strong class="text-slate-200">Fatturato Specifico nel Settore</strong>
                    ${renderHelpBtn('check_fatturato')}
                  </div>
                  <span class="text-[11px] text-slate-400 block mt-0.5">Fatturato negli ultimi 3 esercizi idoneo a coprire quanto richiesto dal bando.</span>
                </div>
              </label>
            </div>

            <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_check_iso" type="checkbox" ${s2.check_iso ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
                <div class="flex-1">
                  <div class="flex items-center">
                    <strong class="text-slate-200">Certificazioni di Qualità (ISO 9001 / CAM)</strong>
                    ${renderHelpBtn('check_iso')}
                  </div>
                  <span class="text-[11px] text-slate-400 block mt-0.5">Certificati aziendali validi (danno anche diritto al 50% di sconto cauzione).</span>
                </div>
              </label>
            </div>

            <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_check_sopralluogo" type="checkbox" ${s2.check_sopralluogo ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
                <div class="flex-1">
                  <div class="flex items-center">
                    <strong class="text-slate-200">Sopralluogo Obbligatorio (ove prescritto)</strong>
                    ${renderHelpBtn('check_sopralluogo')}
                  </div>
                  <span class="text-[11px] text-slate-400 block mt-0.5">Attestato di sopralluogo rilasciato dal RUP dell'ente (se richiesto dal bando).</span>
                </div>
              </label>
            </div>

            <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_check_garanzie" type="checkbox" ${s2.check_garanzie ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
                <div class="flex-1">
                  <div class="flex items-center">
                    <strong class="text-slate-200">Fido Assicurativo / Castelletto Fideiussorio</strong>
                    ${renderHelpBtn('check_garanzie')}
                  </div>
                  <span class="text-[11px] text-slate-400 block mt-0.5">Capienza confermata per emissione cauzione provvisoria e futura definitiva.</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        <!-- Delibera Go / No-Go & Marginalità -->
        <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
          <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
            <span class="font-mono font-bold text-emerald-400 uppercase text-xs">Stima Margine &amp; Delibera Finale</span>
            <span class="text-[10px] text-slate-500 font-mono">Decisione Strategica</span>
          </div>

          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Margine Operativo Netto Target (%):</span>
              ${renderHelpBtn('margin_pct')}
            </label>
            <div class="flex items-center gap-3">
              <input id="w_margin_pct" type="number" step="0.5" value="${s2.margin_estimated_pct || 12.5}" class="w-32 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold text-sm focus:border-cyan-400">
              <span class="text-slate-400 text-xs">Valore suggerito per sostenibilità: &ge; 10%</span>
            </div>
          </div>

          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Esito Valutazione Formale Ufficio Gare:</span>
              ${renderHelpBtn('go_decision')}
            </label>
            <select id="w_go_decision" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 font-bold text-xs focus:border-cyan-400">
              <option value="GO" ${s2.go_decision === 'GO' ? 'selected' : ''}>🟢 GO — Requisiti ok, procedi con l'offerta</option>
              <option value="NO_GO" ${s2.go_decision === 'NO_GO' ? 'selected' : ''}>🔴 NO-GO — Scarta la gara (requisiti mancanti o margini insufficienti)</option>
              <option value="PENDING" ${s2.go_decision === 'PENDING' ? 'selected' : ''}>🟡 IN ATTESA — In attesa di chiarimenti ufficiali dal RUP</option>
            </select>
          </div>

          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Note Strategiche (RTI, Subappalto, Partner):</span>
              ${renderHelpBtn('step2_notes')}
            </label>
            <textarea id="w_step2_notes" rows="2" placeholder="Annotazioni su RTI, quote fornitura, avvalimento..." class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">${escapeHtml(s2.notes || '')}</textarea>
          </div>
        </div>

      </div>
    `;
  }

  // -------------------------------------------------------------
  // FASE 3: LE 3 BUSTE TELEMATICHE (A, B, C)
  // -------------------------------------------------------------
  if (currentWizardStep === 3) {
    const s3 = d.step3_data;
    const activeBusta = s3.active_busta || "A";

    return `
      <!-- BANNER GUIDA DELLA FASE 3 -->
      <div class="bg-gradient-to-br from-purple-950/50 via-slate-900 to-slate-950 border border-purple-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-500/20 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-purple-500 text-slate-950 font-black text-xs flex items-center justify-center">3</span>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>🎯 Cosa devi fare in questa Fase 3: Predisposizione delle 3 Buste Telematiche</span>
                ${renderHelpBtn('buste_overview')}
              </h3>
              <span class="text-[11px] text-purple-300 font-mono">D.Lgs. 36/2023 &bull; Rigorosa Separazione tra Offerta Tecnica ed Economica</span>
            </div>
          </div>

          <!-- BUSTA SELECTOR TABS -->
          <div class="inline-flex rounded-2xl bg-slate-950 p-1.5 border border-slate-800 text-xs shrink-0 self-start sm:self-auto">
            <button onclick="window.setWizardBustaTab('A')" class="px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${activeBusta === 'A' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}">
              <span>Busta A: Amministrativa</span>
            </button>
            <button onclick="window.setWizardBustaTab('B')" class="px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${activeBusta === 'B' ? 'bg-purple-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}">
              <span>Busta B: Tecnica</span>
            </button>
            <button onclick="window.setWizardBustaTab('C')" class="px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${activeBusta === 'C' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}">
              <span>Busta C: Economica</span>
            </button>
          </div>
        </div>

        <div class="p-3 rounded-2xl bg-purple-950/40 border border-purple-800/40 text-purple-200 text-xs leading-relaxed flex items-center gap-2">
          <span class="text-base">⚠️</span>
          <span><strong>Regola di Esclusione Automatica:</strong> Nessun elemento di prezzo (cifre in euro o percentuali di sconto) deve MAI comparire nella Busta A o Busta B, pena l'esclusione insanabile della gara.</span>
        </div>
      </div>

      <!-- TAB CONTENT: BUSTA A AMMINISTRATIVA -->
      ${activeBusta === 'A' ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          
          <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
            <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
              <span class="font-mono font-bold text-cyan-400 uppercase text-xs">Documenti Amministrativi (Busta A)</span>
              <span class="text-[10px] text-slate-500 font-mono">Conformità e Garanzie</span>
            </div>

            <div class="space-y-3">
              <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <label class="flex items-start gap-2.5 cursor-pointer">
                  <input id="w_busta_a_dgue" type="checkbox" ${s3.busta_a_dgue_ready ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
                  <div class="flex-1">
                    <div class="flex items-center">
                      <strong class="text-slate-200">DGUE Elettronico (ESPD XML / PDF)</strong>
                      ${renderHelpBtn('busta_a_dgue')}
                    </div>
                    <span class="text-[11px] text-slate-400 block mt-0.5">Compilato sul portale ANAC/MePA e firmato dal legale rappresentante (.p7m).</span>
                  </div>
                </label>
              </div>

              <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <label class="flex items-start gap-2.5 cursor-pointer">
                  <input id="w_busta_a_fideiussione" type="checkbox" ${s3.busta_a_fideiussione_ready ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
                  <div class="flex-1">
                    <div class="flex items-center">
                      <strong class="text-slate-200">Garanzia Provvisoria ex art. 106 D.Lgs. 36/2023</strong>
                      ${renderHelpBtn('busta_a_fideiussione')}
                    </div>
                    <span class="text-[11px] text-slate-400 block mt-0.5">Importo cauzione: <strong class="text-emerald-400 font-mono">${formatEUR(s3.busta_a_fideiussione_importo)}</strong> (riducibile al 50% con ISO 9001).</span>
                  </div>
                </label>
              </div>

              <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                <label class="flex items-center text-slate-300 font-semibold">
                  <span>Codice Fascicolo FVOE 2.0 / PassOE ANAC:</span>
                  ${renderHelpBtn('fvoe_passoe')}
                </label>
                <div class="flex gap-1.5">
                  <input id="w_fvoe_code" type="text" placeholder="Es. FVOE-99214..." value="${escapeHtml(s3.busta_a_fvoe_passoe || '')}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-cyan-300 font-mono text-xs focus:border-cyan-400">
                  <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('w_fvoe_code').value); showNotification('Codice FVOE copiato!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] shrink-0">Copia</button>
                </div>
                <span class="text-[10px] text-slate-500 font-mono">Consente all'ente il controllo dei requisiti generali</span>
              </div>
            </div>
          </div>

          <!-- Nomenclatura File Busta A -->
          <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
            <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
              <span class="font-mono font-bold text-slate-300 uppercase text-xs flex items-center">
                <span>File Richiesti per Upload su MePA (.p7m)</span>
                ${renderHelpBtn('busta_a_files')}
              </span>
              <span class="text-[10px] text-slate-500 font-mono">Firma Digitale CAdES</span>
            </div>

            <p class="text-[11px] text-slate-400">Rinomina i documenti con la seguente nomenclatura prima di apporre la firma digitale:</p>
            
            <div class="space-y-2.5">
              ${(s3.busta_a_files || []).map((file, idx) => `
                <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                  <span class="font-mono text-cyan-300 text-[11px] truncate select-all">${file}</span>
                  <button type="button" onclick="navigator.clipboard.writeText('${file}'); showNotification('Nome file copiato!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-cyan-950 text-slate-300 hover:text-cyan-300 font-mono text-[10px] border border-slate-700 shrink-0">Copia Nome</button>
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      ` : ''}

      <!-- TAB CONTENT: BUSTA B TECNICA -->
      ${activeBusta === 'B' ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          
          <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
            <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
              <span class="font-mono font-bold text-purple-400 uppercase text-xs">Offerta Tecnica &amp; CAM (Busta B)</span>
              <span class="text-[10px] text-slate-500 font-mono">Qualità e Punteggi</span>
            </div>

            <div class="space-y-3">
              <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <label class="flex items-start gap-2.5 cursor-pointer">
                  <input id="w_busta_b_ready" type="checkbox" ${s3.busta_b_ready ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-purple-500 mt-0.5">
                  <div class="flex-1">
                    <div class="flex items-center">
                      <strong class="text-slate-200">Relazione Tecnica Descrittiva Completa</strong>
                      ${renderHelpBtn('busta_b_ready')}
                    </div>
                    <span class="text-[11px] text-slate-400 block mt-0.5">Impaginata rigorosamente entro il limite massimo di pagine del disciplinare.</span>
                  </div>
                </label>
              </div>

              <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <label class="flex items-start gap-2.5 cursor-pointer">
                  <input id="w_busta_b_cam" type="checkbox" ${s3.busta_b_criteri_cam ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-purple-500 mt-0.5">
                  <div class="flex-1">
                    <div class="flex items-center">
                      <strong class="text-slate-200">Criteri Ambientali Minimi (CAM) &amp; Premialità</strong>
                      ${renderHelpBtn('busta_b_cam')}
                    </div>
                    <span class="text-[11px] text-slate-400 block mt-0.5">Schede dei produttori e certificati ecologici per massimo punteggio.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- File Busta B -->
          <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
            <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
              <span class="font-mono font-bold text-slate-300 uppercase text-xs flex items-center">
                <span>File Busta Tecnica (.p7m)</span>
                ${renderHelpBtn('busta_b_files')}
              </span>
              <span class="text-[10px] text-slate-500 font-mono">Zero elementi di prezzo</span>
            </div>

            <div class="space-y-2.5">
              ${(s3.busta_b_files || []).map((file, idx) => `
                <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                  <span class="font-mono text-purple-300 text-[11px] truncate select-all">${file}</span>
                  <button type="button" onclick="navigator.clipboard.writeText('${file}'); showNotification('Nome file copiato!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] shrink-0">Copia Nome</button>
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      ` : ''}

      <!-- TAB CONTENT: BUSTA C ECONOMICA -->
      ${activeBusta === 'C' ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          
          <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
            <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
              <span class="font-mono font-bold text-emerald-400 uppercase text-xs">Calcolo Offerta Economica (Busta C)</span>
              <span class="text-[10px] text-slate-500 font-mono">D.Lgs. 36/2023 art. 108</span>
            </div>

            <div class="grid grid-cols-2 gap-3.5">
              <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <label class="flex items-center text-slate-300 font-semibold mb-1">
                  <span>Base d'Asta (€):</span>
                  ${renderHelpBtn('busta_c_base')}
                </label>
                <input type="text" readonly value="${formatEUR(s3.busta_c_base_amount || tender.amount)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono text-xs">
              </div>

              <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <label class="flex items-center text-slate-300 font-semibold mb-1">
                  <span>Ribasso Offerto (%):</span>
                  ${renderHelpBtn('busta_c_discount')}
                </label>
                <input id="w_discount_pct" type="number" step="0.01" value="${s3.busta_c_discount_pct || 5.5}" onchange="window.recalcBustaCEconomics()" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold text-xs focus:border-cyan-400">
              </div>
            </div>

            <!-- Prezzo Netto Ricalcolato -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5">
              <label class="flex items-center text-slate-300 font-semibold">
                <span>Prezzo Complessivo Netto Offerto:</span>
                ${renderHelpBtn('busta_c_price')}
              </label>
              <div class="flex gap-1.5">
                <input id="w_offered_price" type="text" readonly value="${formatEUR(s3.busta_c_offered_price)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-black text-sm">
                <button type="button" onclick="navigator.clipboard.writeText('${s3.busta_c_offered_price ? s3.busta_c_offered_price.toFixed(2) : '0'}'); showNotification('Cifra netta copiata!');" class="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs shrink-0 font-semibold">Copia Cifra</button>
              </div>
            </div>

            <!-- Manodopera & Oneri Sicurezza ex art. 108 c. 9 -->
            <div class="grid grid-cols-2 gap-3.5 pt-1">
              <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <label class="flex items-center text-slate-300 font-semibold mb-1">
                  <span>Costi Manodopera (€):</span>
                  ${renderHelpBtn('busta_c_manodopera')}
                </label>
                <input id="w_manodopera" type="number" value="${s3.busta_c_manodopera || 0}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs focus:border-cyan-400">
                <span class="text-[9px] text-rose-400 block mt-1">Obbligatorio a pena di esclusione!</span>
              </div>

              <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <label class="flex items-center text-slate-300 font-semibold mb-1">
                  <span>Oneri Sicurezza (€):</span>
                  ${renderHelpBtn('busta_c_sicurezza')}
                </label>
                <input id="w_sicurezza" type="number" value="${s3.busta_c_sicurezza || 0}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs focus:border-cyan-400">
                <span class="text-[9px] text-slate-500 block mt-1">Spese aziendali D.Lgs. 81/08</span>
              </div>
            </div>
          </div>

          <!-- File Busta C -->
          <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
            <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
              <span class="font-mono font-bold text-slate-300 uppercase text-xs flex items-center">
                <span>File Offerta Economica MePA (.p7m)</span>
                ${renderHelpBtn('busta_c_files')}
              </span>
              <span class="text-[10px] text-slate-500 font-mono">Modello Consip Firmato</span>
            </div>

            <p class="text-[11px] text-slate-400 leading-relaxed">Scarica il PDF dal MePA solo dopo aver inserito il ribasso, firmalo digitalmente e ricaricalo a sistema:</p>
            
            <div class="space-y-2.5">
              ${(s3.busta_c_files || []).map((file, idx) => `
                <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                  <span class="font-mono text-emerald-300 text-[11px] truncate select-all">${file}</span>
                  <button type="button" onclick="navigator.clipboard.writeText('${file}'); showNotification('Nome file copiato!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] shrink-0">Copia Nome</button>
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      ` : ''}
    `;
  }

  // -------------------------------------------------------------
  // FASE 4: ESITO, AGGIUDICAZIONE & SVINCOLO POLIZZE
  // -------------------------------------------------------------
  if (currentWizardStep === 4) {
    const s4 = d.step4_data;
    return `
      <!-- BANNER GUIDA DELLA FASE 4 -->
      <div class="bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-950 border border-emerald-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between border-b border-emerald-500/20 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center">4</span>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>🎯 Cosa devi fare in questa Fase 4: Esito, Aggiudicazione &amp; Svincolo Polizze</span>
              </h3>
              <span class="text-[11px] text-emerald-300 font-mono">Post-Gara &bull; Gestione Graduatoria &amp; Richiesta Liberatoria Fideiussione</span>
            </div>
          </div>
          <button onclick="window.showWizardHelpModal('fase4_svincolo')" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-mono inline-flex items-center gap-1.5 border border-slate-700 shadow-sm">
            <span>Guida Svincolo ?</span>
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-emerald-400 block font-mono text-[11px] mb-1">Passo 4.1: Registra l'Esito Ufficiale</strong>
            <p class="text-slate-300 leading-relaxed">Aggiorna lo stato della gara (Vinta, Persa, In Valutazione). Se vinta, predisponi la cauzione definitiva del 10%.</p>
          </div>
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-cyan-400 block font-mono text-[11px] mb-1">Passo 4.2: Richiedi Svincolo Provvisoria</strong>
            <p class="text-slate-300 leading-relaxed">Se la gara è conclusa (o persa), invia subito la PEC al RUP per farti rilasciare la liberatoria da trasmettere alla tua assicurazione per ripristinare il castelletto.</p>
          </div>
        </div>
      </div>

      <!-- FORM SEZIONI FASE 4 -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        
        <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
          <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
            <span class="font-mono font-bold text-emerald-400 uppercase text-xs">Registrazione Esito Gara</span>
            <span class="text-[10px] text-slate-500 font-mono">Verbale di Gara</span>
          </div>

          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Stato Aggiudicazione:</span>
              ${renderHelpBtn('fase4_outcome')}
            </label>
            <select id="w_outcome" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 font-bold text-xs focus:border-cyan-400">
              <option value="Vinta" ${s4.outcome === 'Vinta' ? 'selected' : ''}>🏆 Gara Vinta (Aggiudicazione Definitiva)</option>
              <option value="Persa" ${s4.outcome === 'Persa' ? 'selected' : ''}>❌ Gara Non Aggiudicata (Secondi classificati o scartati)</option>
              <option value="In Valutazione" ${s4.outcome === 'In Valutazione' ? 'selected' : ''}>⏳ In Valutazione (In attesa di seduta pubblica o anomalia)</option>
            </select>
          </div>

          <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
            <label class="flex items-start gap-2.5 cursor-pointer">
              <input id="w_fideiussione_svincolata" type="checkbox" ${s4.fideiussione_svincolata ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
              <div class="flex-1">
                <div class="flex items-center">
                  <strong class="text-slate-200">PEC di Richiesta Svincolo Cauzione Inviata</strong>
                  ${renderHelpBtn('fase4_svincolo')}
                </div>
                <span class="text-[11px] text-slate-400 block mt-0.5">Richiesta formale inviata al RUP per liberare il massimale fideiussorio.</span>
              </div>
            </label>
          </div>
        </div>

        <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
          <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
            <span class="font-mono font-bold text-slate-300 uppercase text-xs">Verbale &amp; Dati Concorrenti</span>
            <span class="text-[10px] text-slate-500 font-mono">Archivio Storico</span>
          </div>

          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Note sull'Aggiudicazione &amp; Classifica:</span>
              ${renderHelpBtn('fase4_notes')}
            </label>
            <textarea id="w_step4_notes" rows="4" placeholder="Nome dell'aggiudicatario, ribasso vincente, distacco punteggi..." class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400 leading-relaxed">${escapeHtml(s4.note_conclusive || '')}</textarea>
          </div>
        </div>

      </div>
    `;
  }
}

/**
 * Legge i valori dagli input dello step corrente e li salva nello stato in memoria
 */
function readInputsFromWizardDOM() {
  const d = currentWizardData;

  if (currentWizardStep === 1) {
    const cigEl = document.getElementById("w_cig");
    const qaEl = document.getElementById("w_qa_deadline");
    const deadEl = document.getElementById("w_deadline");
    const authEl = document.getElementById("w_authority");
    const rupEl = document.getElementById("w_rup_name");
    const titleEl = document.getElementById("w_title");

    if (cigEl) d.step1_data.cig = cigEl.value.trim().toUpperCase();
    if (qaEl) d.step1_data.qa_deadline = qaEl.value;
    if (deadEl) d.step1_data.deadline = deadEl.value;
    if (authEl) d.step1_data.authority = authEl.value;
    if (rupEl) d.step1_data.rup_name = rupEl.value;
    if (titleEl) d.step1_data.title = titleEl.value;
  } else if (currentWizardStep === 2) {
    const fCheck = document.getElementById("w_check_fatturato");
    const isoCheck = document.getElementById("w_check_iso");
    const soprCheck = document.getElementById("w_check_sopralluogo");
    const garCheck = document.getElementById("w_check_garanzie");
    const marginEl = document.getElementById("w_margin_pct");
    const goEl = document.getElementById("w_go_decision");
    const notesEl = document.getElementById("w_step2_notes");

    if (fCheck) d.step2_data.check_fatturato = fCheck.checked;
    if (isoCheck) d.step2_data.check_iso = isoCheck.checked;
    if (soprCheck) d.step2_data.check_sopralluogo = soprCheck.checked;
    if (garCheck) d.step2_data.check_garanzie = garCheck.checked;
    if (marginEl) d.step2_data.margin_estimated_pct = parseFloat(marginEl.value) || 0;
    if (goEl) d.step2_data.go_decision = goEl.value;
    if (notesEl) d.step2_data.notes = notesEl.value;
  } else if (currentWizardStep === 3) {
    const dgueCheck = document.getElementById("w_busta_a_dgue");
    const fidCheck = document.getElementById("w_busta_a_fideiussione");
    const fvoeEl = document.getElementById("w_fvoe_code");
    const bReady = document.getElementById("w_busta_b_ready");
    const bCam = document.getElementById("w_busta_b_cam");
    const discEl = document.getElementById("w_discount_pct");
    const manoEl = document.getElementById("w_manodopera");
    const sicEl = document.getElementById("w_sicurezza");

    if (dgueCheck) d.step3_data.busta_a_dgue_ready = dgueCheck.checked;
    if (fidCheck) d.step3_data.busta_a_fideiussione_ready = fidCheck.checked;
    if (fvoeEl) d.step3_data.busta_a_fvoe_passoe = fvoeEl.value.trim();
    if (bReady) d.step3_data.busta_b_ready = bReady.checked;
    if (bCam) d.step3_data.busta_b_criteri_cam = bCam.checked;
    if (discEl) {
      d.step3_data.busta_c_discount_pct = parseFloat(discEl.value) || 0;
      const base = d.step3_data.busta_c_base_amount || 0;
      d.step3_data.busta_c_offered_price = base * (1 - (d.step3_data.busta_c_discount_pct / 100));
    }
    if (manoEl) d.step3_data.busta_c_manodopera = parseFloat(manoEl.value) || 0;
    if (sicEl) d.step3_data.busta_c_sicurezza = parseFloat(sicEl.value) || 0;
  } else if (currentWizardStep === 4) {
    const outEl = document.getElementById("w_outcome");
    const fidSvinEl = document.getElementById("w_fideiussione_svincolata");
    const notesEl = document.getElementById("w_step4_notes");

    if (outEl) d.step4_data.outcome = outEl.value;
    if (fidSvinEl) d.step4_data.fideiussione_svincolata = fidSvinEl.checked;
    if (notesEl) d.step4_data.note_conclusive = notesEl.value;
  }
}

/**
 * Ricalcola dinamicamente l'offerta economica in Busta C al variare del ribasso %
 */
window.recalcBustaCEconomics = function() {
  const discEl = document.getElementById("w_discount_pct");
  const offeredPriceEl = document.getElementById("w_offered_price");
  if (!discEl || !offeredPriceEl) return;

  const pct = parseFloat(discEl.value) || 0;
  const base = currentWizardData.step3_data.busta_c_base_amount || 0;
  const offered = base * (1 - (pct / 100));
  offeredPriceEl.value = formatEUR(offered);
  currentWizardData.step3_data.busta_c_discount_pct = pct;
  currentWizardData.step3_data.busta_c_offered_price = offered;
};

/**
 * Cambia il tab attivo tra Busta A, B e C
 */
window.setWizardBustaTab = function(tabName) {
  readInputsFromWizardDOM();
  currentWizardData.step3_data.active_busta = tabName;
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  const content = document.getElementById("wizardStepContent");
  if (content) content.innerHTML = renderCurrentStepContent(tender);
};

/**
 * Sposta il Wizard allo step specificato
 */
window.setWizardStep = function(stepNum) {
  readInputsFromWizardDOM();
  currentWizardStep = stepNum;
  currentWizardData.current_step = stepNum;
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  renderWizardView(tender);
};

/**
 * Salva e avanza allo step successivo
 */
window.advanceStepAndSave = async function() {
  readInputsFromWizardDOM();
  if (currentWizardStep < 4) {
    currentWizardStep++;
    currentWizardData.current_step = currentWizardStep;
  }
  await window.saveCurrentWizardState();
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  renderWizardView(tender);
};

/**
 * Copia i valori del corrente step negli appunti in formato testo pulito per incollarli su acquistinretepa.it
 */
window.copyStepValuesForPortal = function() {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  let textToCopy = "";

  if (currentWizardStep === 1) {
    textToCopy = `=== DATI BANDO CONSIP MEPA ===\nCIG: ${d.step1_data.cig}\nEnte: ${d.step1_data.authority}\nOggetto: ${d.step1_data.title}\nScadenza Domande: ${d.step1_data.qa_deadline}\nScadenza Bando: ${d.step1_data.deadline}\nRUP: ${d.step1_data.rup_name || 'N/D'}`;
  } else if (currentWizardStep === 2) {
    textToCopy = `=== QUALIFICAZIONE GO / NO-GO ===\nEsito: ${d.step2_data.go_decision}\nFatturato OK: ${d.step2_data.check_fatturato ? 'SI' : 'NO'}\nCertificazioni ISO: ${d.step2_data.check_iso ? 'SI' : 'NO'}\nMargine Stimato: ${d.step2_data.margin_estimated_pct}%\nNote: ${d.step2_data.notes || '-'}`;
  } else if (currentWizardStep === 3) {
    textToCopy = `=== DATI LE 3 BUSTE TELEMATICHE ===\nCIG: ${d.step1_data.cig}\nPassOE/FVOE 2.0: ${d.step3_data.busta_a_fvoe_passoe || 'N/D'}\nFideiussione Provvisoria (€): ${d.step3_data.busta_a_fideiussione_importo}\nRibasso Percentuale: ${d.step3_data.busta_c_discount_pct}%\nPrezzo Netto Offerto (€): ${d.step3_data.busta_c_offered_price ? d.step3_data.busta_c_offered_price.toFixed(2) : '0'}\nCosti Manodopera (€): ${d.step3_data.busta_c_manodopera}\nOneri Sicurezza (€): ${d.step3_data.busta_c_sicurezza}`;
  } else if (currentWizardStep === 4) {
    textToCopy = `=== ESITO GARA & SVINCOLO ===\nCIG: ${d.step1_data.cig}\nEsito: ${d.step4_data.outcome}\nFideiussione Svincolata: ${d.step4_data.fideiussione_svincolata ? 'SI' : 'NO'}\nNote: ${d.step4_data.note_conclusive || '-'}`;
  }

  navigator.clipboard.writeText(textToCopy);
  const btnLabel = document.getElementById("btnCopyStepLabel");
  if (btnLabel) {
    btnLabel.textContent = "✓ Dati Copiati negli Appunti!";
    setTimeout(() => { btnLabel.textContent = "Copia Dati per Portale Consip"; }, 2500);
  }
  showNotification("Dati copiati! Puoi incollarli direttamente su acquistinretepa.it");
};

/**
 * Apre la modale per mostrare ed esportare il payload JSON completo per l'agente Browser-Use
 */
window.openAgentExportModal = function() {
  readInputsFromWizardDOM();
  const d = currentWizardData;

  const payload = {
    contract_type: "mepa_consip_tender_payload",
    version: "1.0",
    generated_at: new Date().toISOString(),
    tender: {
      id: d.gara_id,
      cig: d.step1_data.cig,
      authority: d.step1_data.authority,
      title: d.step1_data.title,
      deadline: d.step1_data.deadline,
      portal_url: d.step1_data.link || "https://www.acquistinretepa.it"
    },
    qualification: {
      decision: d.step2_data.go_decision,
      margin_pct: d.step2_data.margin_estimated_pct
    },
    busta_a: {
      dgue_ready: d.step3_data.busta_a_dgue_ready,
      fvoe_code: d.step3_data.busta_a_fvoe_passoe,
      fideiussione_amount: d.step3_data.busta_a_fideiussione_importo,
      files_to_upload: d.step3_data.busta_a_files
    },
    busta_b: {
      technical_ready: d.step3_data.busta_b_ready,
      files_to_upload: d.step3_data.busta_b_files
    },
    busta_c: {
      base_amount: d.step3_data.busta_c_base_amount,
      discount_percentage: d.step3_data.busta_c_discount_pct,
      offered_price: d.step3_data.busta_c_offered_price,
      manodopera_costs: d.step3_data.busta_c_manodopera,
      security_costs: d.step3_data.busta_c_sicurezza,
      files_to_upload: d.step3_data.busta_c_files
    }
  };

  const jsonStr = JSON.stringify(payload, null, 2);

  let modal = document.getElementById("agentExportModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "agentExportModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-sm">🤖</span>
          <div>
            <h3 class="text-sm font-bold text-white">Payload per Agente Autonomo (Browser-Use)</h3>
            <p class="text-[11px] text-slate-400 font-mono">Formato JSON strutturato per compilazione automatica su acquistinretepa.it</p>
          </div>
        </div>
        <button onclick="document.getElementById('agentExportModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar">
        <pre class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-purple-300 font-mono text-[11px] select-all leading-relaxed">${escapeHtml(jsonStr)}</pre>
      </div>

      <div class="flex items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
        <span class="text-slate-400 font-mono text-[11px]">CIG: ${escapeHtml(d.step1_data.cig || '-')}</span>
        <div class="flex items-center gap-2">
          <button onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(jsonStr)}')); showNotification('JSON copiato negli appunti!');" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition">
            Copia JSON
          </button>
          <a download="payload_mepa_${d.step1_data.cig || 'gara'}.json" href="data:application/json;charset=utf-8,${encodeURIComponent(jsonStr)}" class="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center gap-1.5">
            Scarica .json
          </a>
        </div>
      </div>
    </div>
  `;
  modal.classList.remove("hidden");
};
