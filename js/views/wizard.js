/**
 * MePA & Consip Desk Pro - Wizard Deterministico Partecipazione Gara
 * Aderente ai principi D.Lgs. 36/2023, Spec-Driven Design (sddesign) e dual-handoff (manuale / browser-use agent).
 * 
 * Include:
 * - Guida operativa contestuale su ogni singolo campo e fase (pulsanti interattivi '?')
 * - Validazione deterministica e Gating tra le fasi (WizardRules)
 * - Calcolo cauzione provvisoria ex art. 106 c.8 (ISO 9001 -30%, PMI -50%, fideiussione digitale -10%)
 * - Scorporo costi manodopera e oneri aziendali ex art. 108 c.9 con eccezione per fornitura senza posa
 * - Monitoraggio marginalita' e prezzi netti con verifica rischio anomalia ex art. 110
 * - Dual hand-off: copia negli appunti formattata per portale Consip & JSON payload arricchito per agenti
 * - Sincronizzazione automatica dello stato gara su SQLite 3 (tabella gare_workflow e gare)
 */

// Stato locale del Wizard
let currentWizardGaraId = null;
let currentWizardStep = 1;
let currentWizardData = {
  gara_id: null,
  current_step: 1,
  gara_status: null,
  step1_data: {},
  step2_data: {},
  step3_data: {},
  step4_data: {}
};

/**
 * Dizionario enciclopedico di supporto interattivo per ogni funzionalita' e campo del Wizard
 */
const WIZARD_HELP_GUIDE = {
  general_wizard: {
    category: "GUIDA GENERALE AL WORKFLOW",
    title: "Come Funziona il Wizard Deterministico MePA",
    what: "Il Wizard e' una pipeline operativa deterministica in 4 fasi che traduce le regole di partecipazione del Nuovo Codice degli Appalti (D.Lgs. 36/2023) e del portale AcquistinretePA in un flusso sequenziale a prova di errore.",
    portal_location: "Portale www.acquistinretepa.it -> Sezione 'Gare e RdO' -> Gestione Partecipazione.",
    what_to_do: "Segui le 4 fasi in ordine: 1) Registra gli identificativi e verifica i termini di chiarimento. 2) Esegui la delibera Go/No-Go per non sprecare risorse. 3) Prepara e firma le 3 Buste (Amministrativa, Tecnica, Economica). 4) Traccia l'esito e richiedi lo svincolo fideiussione.",
    legal_tip: "Il rispetto rigoroso della separazione delle buste e dei termini perentori di invio offerta e quesiti previene il 100% dei motivi di esclusione formale."
  },
  cig: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Codice Identificativo Gara (CIG)",
    what: "E' il codice alfanumerico univoco di 10 caratteri rilasciato da ANAC tramite le Piattaforme di Approvvigionamento Digitale (PAD) certificate interoperabili con la PCP ANAC.",
    portal_location: "In cima alla scheda bando su acquistinretepa.it, sotto il titolo della RdO o nel disciplinare di gara.",
    what_to_do: "Verifica che il CIG corrisponda esattamente a quello del bando. Usa il pulsante 'Copia' per cercarlo all'interno di ANAC FVOE 2.0 o sul portale Consip.",
    legal_tip: "ATTENZIONE: dal 1 gennaio 2024 il sistema SIMOG e lo SmartCIG sono stati definitivamente aboliti per effetto della digitalizzazione integrale (art. 25 D.Lgs. 36/2023). Tutte le procedure, compresi i micro-affidamenti sotto i 5.000€, utilizzano esclusivamente CIG ordinari di 10 caratteri."
  },
  qa_deadline: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Termine per Richiesta Chiarimenti (Q&A)",
    what: "E' la data e ora limite entro cui i concorrenti possono porre quesiti alla Stazione Appaltante su clausole oscure, incongruenze o richieste tecniche.",
    portal_location: "Scheda 'Date della Procedura' della RdO su AcquistinretePA o capitolo 'Chiarimenti' del Disciplinare.",
    what_to_do: "Imposta la data. Se mancano pochi giorni, invia immediatamente i quesiti tramite il portale Consip (sezione Chiarimenti). I chiarimenti inviati via PEC o fuori termine vengono dichiarati inammissibili.",
    legal_tip: "Ai sensi dell'art. 92, comma 2, lett. a) del D.Lgs. 36/2023, la Stazione Appaltante deve pubblicare le risposte almeno 6 giorni prima della scadenza delle offerte (ridotti a 4 giorni nelle procedure d'urgenza). Il termine per la presentazione dei quesiti da parte dei concorrenti scade pertanto con congruo anticipo stabilito nel bando."
  },
  deadline: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Termine Perentorio Presentazione Offerta",
    what: "La scadenza improrogabile di sistema entro cui tutte e 3 le buste devono essere caricate, firmate digitalmente e inviate a sistema MePA.",
    portal_location: "Evidenziata in rosso su acquistinretepa.it e all'art. 1 del Disciplinare.",
    what_to_do: "Pianifica l'invio finale almeno 24-48 ore prima della scadenza. I blocchi dei server Consip o rallentamenti della connessione nell'ultima ora non giustificano la riammissione.",
    legal_tip: "Il termine di scadenza offerta e' perentorio a pena di decadenza automatica stabilito dall'art. 92 D.Lgs. 36/2023."
  },
  authority: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Stazione Appaltante / Ente Pubblico",
    what: "L'amministrazione pubblica (Comune, Ministero, ASL, Universita') che ha indetto la procedura concorsuale.",
    portal_location: "Intestazione della scheda bando su MePA.",
    what_to_do: "Verifica che l'ente rientri tra le amministrazioni verso cui l'azienda puo' emettere fattura elettronica e non abbia contenziosi aperti.",
    legal_tip: "Verifica nel disciplinare se l'ente appalta per se' o come centrale di committenza qualificata ex art. 62 D.Lgs. 36/2023."
  },
  rup_name: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Responsabile Unico del Progetto (RUP)",
    what: "Il funzionario pubblico nominato dalla Stazione Appaltante responsabile di tutte le fasi dell'appalto.",
    portal_location: "Disciplinare di gara, art. 'Responsabile del Progetto' o 'Contatti'.",
    what_to_do: "Inserisci il nome e la qualifica del RUP. Ti servira' per intestare eventuali comunicazioni formali, istanze di chiarimento o PEC di richiesta svincolo polizze.",
    legal_tip: "Ai sensi dell'art. 15 D.Lgs. 36/2023, il RUP e' l'unico interlocutore istituzionale per la procedura."
  },
  title: {
    category: "FASE 1: IDENTIFICAZIONE",
    title: "Oggetto della Fornitura / Servizio",
    what: "Descrizione sintetica delle prestazioni richieste dalla PA (beni, servizi informatici, manutenzione, lavori).",
    portal_location: "Titolo principale del bando o art. 'Oggetto dell'Appalto' nel Disciplinare.",
    what_to_do: "Leggilo con attenzione per verificare la compatibilita' con i codici ATECO e l'oggetto sociale della tua azienda.",
    legal_tip: "L'offerta tecnica ed economica deve corrispondere fedelmente all'oggetto; varianti non ammesse portano all'esclusione."
  },
  check_fatturato: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Fatturato Specifico nel Settore",
    simple_explanation: "La legge permette alla PA di chiedere se negli ultimi 3 anni la tua azienda ha già incassato una cifra simile per lavori analoghi (serve a dimostrare che sei un'azienda solida e con esperienza). Se da solo non raggiungi la cifra, non sei escluso: puoi unirti ad un'altra azienda (RTI) o farti prestare il requisito con l'avvalimento.",
    what: "Requisito di capacita' economico-finanziaria: la stazione appaltante puo' richiedere un fatturato minimo maturato negli ultimi 3 esercizi finanziari.",
    portal_location: "Disciplinare di Gara -> Sezione 'Requisiti di partecipazione economico-finanziari'.",
    what_to_do: "Usa il nostro pulsante '⚡ Pipeline Verifica Requisito Fatturato': inserisci i tuoi fatturati degli ultimi 3 anni e il sistema calcolerà in automatico se sei autosufficiente o se ti serve un partner.",
    legal_tip: "L'art. 100 del D.Lgs. 36/2023 stabilisce che il fatturato specifico richiesto non puo' superare il doppio del valore stimato dell'appalto."
  },
  check_iso: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Certificazioni di Qualita' (ISO 9001 / CAM)",
    simple_explanation: "Avere la certificazione ISO 9001 (o essere una Piccola/Media Impresa) ti fa risparmiare soldi veri: per legge hai diritto a uno sconto dal 30% al 50% sul costo della cauzione che devi versare per partecipare alla gara!",
    what: "Certificati aziendali di gestione qualita' (UNI EN ISO 9001, ISO 27001, ISO 14001) e rispetto dei Criteri Ambientali Minimi (CAM).",
    portal_location: "Disciplinare di Gara -> Sezione 'Requisiti di idoneita' professionale e CAM'.",
    what_to_do: "Clicca su '⚡ Verifica Certificazioni & Taglio Cauzione': seleziona le tue certificazioni e il sistema calcolerà in automatico la cauzione scontata trasferendola alla Busta A.",
    legal_tip: "Ai sensi dell'art. 106 c. 8 D.Lgs. 36/2023, la riduzione per ISO 9001 e' del 30% (nel vecchio D.Lgs. 50/2016 era del 50%). Per le Micro, Piccole e Medie Imprese (PMI) si applica invece la riduzione del 50%, non cumulabile con la riduzione per ISO 9001 (si applica la riduzione maggiore)."
  },
  check_sopralluogo: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Sopralluogo Obbligatorio (ove prescritto)",
    simple_explanation: "Significa che prima di fare l'offerta devi mandare un tuo tecnico sul posto (es. negli uffici del Comune o dell'ASL) a visionare gli spazi. Il funzionario pubblico ti firmerà un foglio di presenza. Se il bando dice 'obbligatorio a pena di esclusione' e non ci vai, vieni escluso automaticamente!",
    what: "Ispezione fisica o virtuale dei luoghi di esecuzione del servizio/lavoro prima dell'invio dell'offerta.",
    portal_location: "Disciplinare di Gara -> Sezione 'Sopralluogo'.",
    what_to_do: "Clicca su '⚡ Guida Sopralluogo': seleziona 'Non richiesto' se vendi solo software/forniture, oppure genera subito con un clic la PEC da spedire al RUP per fissare la data dell'appuntamento.",
    legal_tip: "Se obbligatorio, la mancata effettuazione o la mancanza dell'attestato nella Busta A comporta l'esclusione non sanabile con soccorso istruttorio."
  },
  check_garanzie: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Fido Assicurativo / Castelletto Fideiussorio",
    simple_explanation: "Funziona esattamente come il plafond della tua carta di credito, ma per le garanzie pubbliche: la tua assicurazione ti dice 'ti garantisco fino a 50.000€'. Quando fai una gara che chiede 2.000€ di garanzia, devi accertarti che il tuo plafond residuo non sia esaurito da altre gare ancora aperte.",
    what: "Verifica della disponibilita' del fido presso la banca o compagnia assicurativa per emettere la Garanzia Provvisoria (1-4% dell'importo).",
    portal_location: "Contatto con il proprio broker o istituto bancario convenzionato.",
    what_to_do: "Clicca su '⚡ Verifica Capienza Plafond': inserisci il tuo massimale e scopri all'istante se sei coperto o se devi farti alzare il fido dall'assicurazione.",
    legal_tip: "La polizza fideiussoria deve contenere espressamente l'impegno a rilasciare la cauzione definitiva in caso di aggiudicazione (art. 106 c. 5)."
  },
  margin_pct: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Margine Operativo Netto Stimato (%)",
    simple_explanation: "È il guadagno vero che resta in tasca alla tua azienda dopo aver pagato i fornitori, i dipendenti/tecnici, la sicurezza e le spese della gara. Se offri un ribasso troppo alto e il margine scende sotto zero, stai lavorando gratis o in perdita!",
    what: "Percentuale di utile netto target che l'azienda intende ricavare dalla commessa detratte tutte le spese di fornitura, manodopera e generali.",
    portal_location: "Calcolo interno dell'ufficio gare / Business Plan di commessa.",
    what_to_do: "Clicca sul pulsante verde '⚡ Calcolatore Analitico Margine di Commessa': muovi lo slider del ribasso e visualizza in diretta se l'appalto è in utile o a rischio perdita.",
    legal_tip: "Le offerte con marginalita' eccessivamente compressa rischiano di incorrere nella verifica di anomalia dell'offerta ex art. 110 D.Lgs. 36/2023."
  },
  go_decision: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Delibera Strategica Go / No-Go",
    simple_explanation: "È il bivio decisionale dell'azienda: 🟢 GO significa 'i requisiti ci sono, il guadagno è buono, prepariamo l'offerta'; 🔴 NO-GO significa 'scartiamo questa gara per non sprecare giorni di lavoro su un bando non idoneo'.",
    what: "Delibera aziendale formale che autorizza l'avanzamento alla Fase 3 (redazione delle 3 buste) oppure archivia la gara.",
    portal_location: "Scelta strategica interna dell'Ufficio Gare / Direzione Commerciale.",
    what_to_do: "Seleziona GO solo se la checklist è spuntata e il margine è positivo. Il sistema blocca l'accesso alle buste se deliberi NO-GO.",
    legal_tip: "Una rigorosa delibera GO/NO-GO riduce dell'80% i costi amministrativi aziendali per gare non aggiudicabili evitando sanzioni o cauzioni escusse."
  },
  step2_notes: {
    category: "FASE 2: QUALIFICAZIONE",
    title: "Note Strategiche e Consorzi/Subappalto",
    what: "Spazio per annotare accordi con partner per RTI (Raggruppamento Temporaneo), contratti di avvalimento o quote di subappalto da indicare.",
    portal_location: "Archivio interno gare.",
    what_to_do: "Scrivi gli estremi delle quote percentuali di fornitura tra mandataria e mandante o note sul fornitore principale.",
    legal_tip: "Nel nuovo codice 36/2023 non vi e' piu' il tetto rigido del 30% per il subappalto, ma la stazione appaltante puo' indicare prestazioni non subappaltabili."
  },
  buste_overview: {
    category: "FASE 3: LE 3 BUSTE TELEMATICHE",
    title: "Regola di Separazione delle 3 Buste (D.Lgs. 36/2023)",
    simple_explanation: "Immagina di dover consegnare tre cartelline chiuse e sigillate: nella cartella A metti i tuoi documenti d'identità e garanzie; nella cartella B spieghi cosa offri tecnicamente (senza dire il prezzo!); nella cartella C metti il prezzo. È vitale non mischiare mai il prezzo nelle altre buste, altrimenti la legge ti esclude all'istante!",
    what: "Il portale MePA richiede di caricare 3 buste elettroniche distinte: Busta A (Documenti Amministrativi), Busta B (Progetto Tecnico), Busta C (Offerta di Prezzo).",
    portal_location: "Portale www.acquistinretepa.it -> Wizard di sottomissione offerta della RdO.",
    what_to_do: "Clicca sui 3 tab (A, B, C) per visualizzare i documenti e i file specifici richiesti per ciascuna busta. Assicurati che ogni file sia firmato digitalmente in formato CAdES (.p7m).",
    legal_tip: "DIVIETO DI COMMISTIONE: Nessun elemento di prezzo (cifre in euro, percentuali di sconto) deve MAI essere inserito nella Busta A o Busta B, a pena di ESCLUSIONE AUTOMATICA non sanabile!"
  },
  busta_a_dgue: {
    category: "FASE 3: BUSTA A AMMINISTRATIVA",
    title: "DGUE Elettronico (ESPD XML/PDF)",
    simple_explanation: "È il passaporto europeo delle gare d'appalto: un modulo standard in cui dichiari con valore legale che la tua azienda non ha guai giudiziari, è in regola con il DURC e con le tasse, e ha le carte in regola per lavorare con la PA.",
    what: "Il Documento di Gara Unico Europeo e' l'autodichiarazione con cui l'operatore economico attesta il possesso dei requisiti di ordine generale (assenza di reati, regolarita' fiscale e contributiva DURC).",
    portal_location: "Compilabile direttamente online nella sezione 'Busta Amministrativa' di AcquistinretePA oppure su portale ANAC.",
    what_to_do: "Usa il nostro assistente guidato '⚡ Procedura Guidata DGUE': verifica i requisiti di onorabilità e genera la dichiarazione integrativa già pronta.",
    legal_tip: "La falsa dichiarazione nel DGUE comporta la segnalazione all'ANAC con annotazione nel Casellario Informatico e interdizione dalle gare."
  },
  busta_a_fideiussione: {
    category: "FASE 3: BUSTA A AMMINISTRATIVA",
    title: "Garanzia Provvisoria (art. 106 D.Lgs. 36/2023)",
    simple_explanation: "È una polizza assicurativa (o bancaria) che garantisce alla PA che, se vinci la gara, non scapperai ma firmerai il contratto. Di base costa il 2% della gara, ma la legge ti dà il 50% di sconto se sei una PMI e un altro 10% se la fai digitale.",
    what: "Fideiussione bancaria o assicurativa a garanzia della serieta' dell'offerta, pari di norma al 2% (modulabile dalla PA tra 1% e 4%) del valore a base d'asta.",
    portal_location: "Da allegare come file firmato digitalmente dal garante nella Busta Amministrativa su MePA.",
    what_to_do: "Usa il pulsante '⚡ Genera Richiesta Polizza al Broker' per ottenere il testo email con tutte le clausole obbligatorie per legge da inoltrare alla tua compagnia.",
    legal_tip: "RIDUZIONI EX ART. 106 C.8: 50% per Micro, Piccole e Medie Imprese (PMI); 30% per certificazione ISO 9001 (non cumulabile con la riduzione PMI: prevale la maggiore, 50%); ulteriore 10% per fideiussione digitale verificabile telematicamente (cumulabile)."
  },
  fvoe_passoe: {
    category: "FASE 3: BUSTA A AMMINISTRATIVA",
    title: "Fascicolo Virtuale FVOE 2.0 ANAC",
    simple_explanation: "È la 'chiave d'accesso' per l'ANAC: registri la gara sul sito ANAC e ottieni un codice. Con questo codice l'ente pubblico può verificare da solo e all'istante il tuo casellario giudiziale e la tua regolarità fiscale senza chiederti mille certificati cartacei.",
    what: "Il codice generato sulla piattaforma ANAC (FVOE 2.0) che consente alla Stazione Appaltante di verificare i requisiti generali (DURC, casellario giudiziale, antimafia).",
    portal_location: "Portale dei Servizi ANAC -> Fascicolo Virtuale dell'Operatore Economico (FVOE 2.0).",
    what_to_do: "Clicca su '⚡ Assistente FVOE 2.0 ANAC': segui i 3 passi guidati con link diretto al portale ANAC e genera il codice da inserire nel campo.",
    legal_tip: "Dal 2024 il FVOE 2.0 e' obbligatorio ed e' interconnesso con la Banca Dati Nazionale dei Contratti Pubblici (BDNCP). Il fascicolo deve essere perfezionato prima della scadenza del bando."
  },
  busta_a_files: {
    category: "FASE 3: BUSTA A AMMINISTRATIVA",
    title: "Nomenclatura File e Firma Digitale CAdES",
    simple_explanation: "Tutti i documenti PDF che carichi sul MePA devono essere firmati digitalmente (con la chiavetta USB o smart card di firma): il file firmato assume l'estensione .p7m. Usa i nostri pulsanti 'Copia Nome' per non sbagliare mai il nome dei file.",
    what: "Elenco dei file amministrativi standard da caricare. Consip richiede file firmati digitalmente con estensione .pdf.p7m.",
    portal_location: "Sezione Allegati Busta A su MePA.",
    what_to_do: "Clicca su 'Copia Nome' accanto a ciascun file per rinominare i tuoi documenti PDF prima di firmarli con il tuo software di firma (Dike, ArubaSign, GoSign).",
    legal_tip: "Non usare caratteri speciali, lettere accentate o spazi nei nomi file; usa underscore (_) per evitare errori di caricamento sulla piattaforma."
  },
  busta_b_ready: {
    category: "FASE 3: BUSTA B TECNICA",
    title: "Relazione Tecnica Descrittiva",
    simple_explanation: "È il cuore tecnico della tua offerta: il progetto in cui descrivi come eseguirai il servizio o quali prodotti consegnerai. Rispetta rigorosamente il limite massimo di pagine del bando (es. 20 pagine) e NON citare mai cifre o sconti!",
    what: "Il documento principale in cui l'azienda illustra le caratteristiche qualitative dei beni o servizi offerti, il piano organizzativo e le migliorie.",
    portal_location: "Caricamento nella sezione 'Busta Tecnica' su AcquistinretePA.",
    what_to_do: "Clicca su '⚡ Guida & Checklist Busta Tecnica': verifica l'indice dei capitoli, il rispetto del numero di pagine e l'assenza assoluta di elementi di prezzo.",
    legal_tip: "Le pagine eccedenti il limite stabilito dal disciplinare non vengono lette dalla Commissione Giudicatrice o possono portare all'esclusione."
  },
  busta_b_cam: {
    category: "FASE 3: BUSTA B TECNICA",
    title: "Criteri Ambientali Minimi (CAM) & Punteggio Tecnico",
    simple_explanation: "CAM significa Criteri Ambientali Minimi: le leggi ecologiche obbligatorie per gli acquisti della PA. Se i tuoi prodotti sono ecologici, a basso consumo energetico o hanno imballaggi riciclati, allega le schede tecniche dei produttori per prendere punti preziosi in graduatoria.",
    what: "Dichiarazioni e schede tecniche dei produttori attestanti la conformita' del prodotto ai criteri ecologici ministeriali.",
    portal_location: "Allegati tecnici Busta B su MePA.",
    what_to_do: "Clicca su '⚡ Verifica Criteri Ambientali Minimi (CAM)': seleziona le certificazioni green possedute e genera l'attestazione per l'ente.",
    legal_tip: "I Criteri Ambientali Minimi (art. 57 D.Lgs. 36/2023) sono obbligatori per legge per tutte le forniture della Pubblica Amministrazione."
  },
  busta_b_files: {
    category: "FASE 3: BUSTA B TECNICA",
    title: "File Busta Tecnica (.p7m)",
    simple_explanation: "Sono i file della tua proposta tecnica (relazione descrittiva, schede tecniche dei produttori, certificati CAM) da firmare digitalmente in formato .p7m. Ricorda la regola d'oro: nessun prezzo nella busta tecnica!",
    what: "I file contenenti l'offerta tecnica e le schede prodotto, da firmare in formato digitale CAdES.",
    portal_location: "Sezione Busta Tecnica su MePA.",
    what_to_do: "Copia il nome file standardizzato e rinomina il documento prima della firma digitale.",
    legal_tip: "Rammenta il divieto di commistione: nessun file della Busta Tecnica deve contenere i prezzi o le percentuali di sconto applicate!"
  },
  busta_c_base: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Base d'Asta (€)",
    simple_explanation: "È il prezzo massimo stabilito dall'ente pubblico per la gara: non puoi fare un'offerta più alta della base d'asta, altrimenti vieni escluso immediatamente.",
    what: "L'importo economico massimo stimato dalla Stazione Appaltante a base di gara su cui formulare il ribasso percentuale.",
    portal_location: "Scheda economica della RdO su MePA o bando di gara.",
    what_to_do: "E' precaricata in automatico dal gestionale. Qualsiasi offerta economica con valore superiore alla base d'asta viene esclusa automaticamente.",
    legal_tip: "Ai sensi dell'art. 108, le offerte in rialzo rispetto alla base d'asta sono inammissibili per legge."
  },
  busta_c_discount: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Ribasso Percentuale Offerto (%)",
    simple_explanation: "È la percentuale di sconto che concedi all'ente pubblico rispetto alla base d'asta. Il nostro sistema calcola subito sia il prezzo netto finale in euro, sia il guadagno reale che ti resta in tasca.",
    what: "La percentuale di sconto che l'azienda offre rispetto all'importo a base di gara.",
    portal_location: "Campo 'Ribasso Percentuale' o 'Prezzo a Corpo' nel form economico di AcquistinretePA.",
    what_to_do: "Digita la percentuale (es. 6.50). Il Wizard ricalcola istantaneamente il Prezzo Netto Offerto in euro e verifica l'impatto sul margine.",
    legal_tip: "Nei bandi con criterio del prezzo piu' basso viene applicata l'esclusione automatica delle offerte anomale secondo i metodi di calcolo dell'allegato II.2 al Codice."
  },
  busta_c_price: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Prezzo Netto Offerto (IVA esclusa)",
    simple_explanation: "È la cifra netta finale in euro che la PA ti pagherà se vinci la gara (IVA esclusa). Clicca su 'Copia Cifra' per incollarla senza errori nei campi del portale MePA.",
    what: "La cifra totale in euro risultante dall'applicazione del ribasso percentuale alla base d'asta.",
    portal_location: "Modulo offerta economica generato su MePA.",
    what_to_do: "Usa il tasto 'Copia Cifra' per incollare l'importo esatto nel form di compilazione del portale Consip.",
    legal_tip: "L'importo inserito a sistema fa fede rispetto a qualsiasi altra indicazione verbale. Verifica sempre l'esatta corrispondenza tra cifre e decimali."
  },
  busta_c_manodopera: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Costi della Manodopera (art. 108 c. 9)",
    simple_explanation: "La legge (art. 108 c.9) obbliga a dichiarare quanto del tuo prezzo totale andrà a pagare il lavoro degli addetti/tecnici. Non è un costo in più per la PA, ma una quota interna del tuo prezzo. Se ti dimentichi di scriverlo vieni escluso senza appello!",
    what: "La quota del prezzo totale offerto che l'azienda destina ai costi del personale impiegato per l'esecuzione della commessa.",
    portal_location: "Campo obbligatorio nel modello di offerta economica su MePA.",
    what_to_do: "Clicca su '⚡ Calcolatore Analitico Manodopera': inserisci ore e profilo contrattuale (CCNL) per ottenere la cifra certificata da inserire.",
    legal_tip: "La mancata indicazione dei costi della manodopera comporta l'esclusione automatica della gara (art. 108 c. 9 D.Lgs. 36/2023) non sanabile con soccorso istruttorio, salvo che si tratti di sole forniture senza posa in opera o servizi di natura intellettuale."
  },
  busta_c_sicurezza: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Oneri Aziendali per la Salute e Sicurezza",
    simple_explanation: "Sono le spese interne che la tua azienda sostiene per proteggere i propri dipendenti (visite mediche, corsi sicurezza 81/08, scarpe antinfortunistiche, DPI). Anche questo va scorporato obbligatoriamente per legge.",
    what: "Le spese specifiche che la tua azienda sostiene per adempiere agli obblighi di sicurezza sul lavoro dei propri addetti (DPI, visite mediche, formazione D.Lgs. 81/08).",
    portal_location: "Campo dedicato nel form dell'offerta economica MePA.",
    what_to_do: "Inserisci la stima dei costi aziendali della sicurezza calcolata con il nostro calcolatore guidato.",
    legal_tip: "La mancata indicazione degli oneri aziendali di sicurezza comporta l'esclusione insanabile ex art. 108 c. 9."
  },
  fornitura_senza_posa: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Esclusione Obbligo Manodopera (art. 108 c. 9)",
    simple_explanation: "Se vendi solo prodotti 'da scaffale' (es. scatole di cancelleria, PC imballati senza installazione) o consulenze intellettuali pure, la legge ti esonera dallo scorporare manodopera e sicurezza: basta spuntare questa casella per essere in regola al 100%.",
    what: "Deroga espressa di legge all'obbligo di indicare separatamente i costi della manodopera e della sicurezza.",
    portal_location: "Disciplinare di Gara -> Oggetto della prestazione.",
    what_to_do: "Spunta questa opzione SOLTANTO se la gara ha per oggetto la mera fornitura di beni materiali senza posa in opera, oppure servizi di natura puramente intellettuale.",
    legal_tip: "L'art. 108 c. 9 secondo periodo stabilisce: 'I costi di cui al primo periodo non possono essere modificati in diminuzione. Le disposizioni di cui al primo periodo non si applicano alle forniture senza posa in opera e ai servizi di natura intellettuale'."
  },
  offerta_inviata: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "Conferma Trasmissione Offerta su MePA",
    simple_explanation: "È il traguardo della Fase 3: dopo aver caricato e firmato tutte e 3 le buste sul portale MePA e aver ricevuto la ricevuta con orario ufficiale, spunta questa casella per registrare l'avvenuto invio e passare alla Fase 4 di monitoraggio dell'esito.",
    what: "Dichiarazione formale che tutte e 3 le buste sono state caricate, firmate digitalmente e trasmesse con successo attraverso il portale www.acquistinretepa.it.",
    portal_location: "Riepilogo finale di partecipazione su MePA con ricevuta di protocollazione / timestamp.",
    what_to_do: "Spunta questa casella dopo aver ricevuto la ricevuta di invio della RdO. E' il requisito deterministico obbligatorio per sbloccare la Fase 4 (Esito e Svincolo).",
    legal_tip: "Conserva il file di ricevuta con marca temporale emesso da Consip come prova opponibile ai terzi del tempestivo invio."
  },
  busta_c_files: {
    category: "FASE 3: BUSTA C ECONOMICA",
    title: "File Offerta Economica MePA",
    simple_explanation: "Sul portale MePA, dopo aver inserito il ribasso, il sito genera un modulo PDF con la tua offerta economica: devi scaricarlo sul tuo PC, firmarlo digitalmente con la tua smart card/token e ricaricarlo a sistema (.p7m).",
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
    what_to_do: "Aggiorna lo stato nel menu a tendina. Questo aggiornera' automaticamente anche il Cruscotto KPI e il database SQLite.",
    legal_tip: "Se la gara e' vinta, la Stazione Appaltante chiedera' la costituzione della Garanzia Definitiva (art. 117 D.Lgs. 36/2023)."
  },
  fase4_svincolo: {
    category: "FASE 4: ESITO & POST-GARA",
    title: "Lettera di Svincolo Cauzione Provvisoria",
    what: "La dichiarazione liberatoria che la Stazione Appaltante deve rilasciare ai concorrenti non aggiudicatari per estinguere la polizza fideiussoria.",
    portal_location: "Richiesta da inviare via PEC al RUP indicato nella Fase 1.",
    what_to_do: "Se la gara non e' stata vinta o sono trascorsi i termini di validita' dell'offerta, invia una PEC al RUP richiedendo lo svincolo formale della garanzia per ripristinare il castelletto assicurativo.",
    legal_tip: "Ai sensi dell'art. 106 c. 10, la garanzia cessa automaticamente con l'aggiudicazione definitiva, ma gli istituti bancari esigono la quietanza scritta o PEC del RUP."
  },
  qa_facsimile: {
    category: "FASE 1: CHIARIMENTI Q&A",
    title: "Generatore Fac-Simile Quesito Q&A (art. 92 c.2)",
    what: "Modulo per redigere formalmente una richiesta di chiarimenti da inviare alla Stazione Appaltante e al RUP tramite la sezione Comunicazioni del MePA o via PEC.",
    portal_location: "Portale www.acquistinretepa.it -> Sezione RdO -> Comunicazioni / Chiarimenti.",
    what_to_do: "Digita il quesito puntuale, copia il testo formale o scarica il file .txt e salvalo nel Diario di Bordo della gara per mantenere la traccia documentale.",
    legal_tip: "Ai sensi dell'art. 92 c.2 D.Lgs. 36/2023, la PA deve pubblicare i chiarimenti almeno 6 giorni prima della scadenza delle offerte; le risposte integrano la lex specialis."
  },
  svincolo_facsimile: {
    category: "FASE 4: SVINCOLO POLIZZE",
    title: "Generatore Istanza Svincolo Provvisoria (art. 106 c.10)",
    what: "Atto formale da trasmettere via PEC al RUP per ottenere l'attestazione liberatoria o il nulla osta allo svincolo della fideiussione bancaria o assicurativa.",
    portal_location: "Da inviare all'indirizzo PEC ufficiale della Stazione Appaltante indicato nel Disciplinare.",
    what_to_do: "Inserisci il numero di polizza e la compagnia garante; il sistema compila la PEC citando l'art. 106 c.10 sull'estinzione automatica del vincolo.",
    legal_tip: "Anche se per legge la garanzia dei non aggiudicatari cessa con l'aggiudicazione definitiva, gli istituti fideiussori esigono la quietanza formale del RUP."
  },
  notes_log: {
    category: "GESTIONE AZIENDALE GARE",
    title: "Diario di Bordo & Note Cronologiche (SQLite 3)",
    what: "Registro temporale delle decisioni, risposte del RUP, preventivi dei fornitori, accordi RTI e verbali di gara associati a questo CIG.",
    portal_location: "Archivio interno gestionale (tabella relazionale note_gare).",
    what_to_do: "Aggiungi note su ogni evento significativo: telefonate con il RUP, risposte ai quesiti, delibere di ribasso e annotazioni post-gara.",
    legal_tip: "Costituisce il fascicolo probatorio interno fondamentale in caso di contenzioso o richieste di soccorso istruttorio."
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
    title: "Copia Dati per Portale Consip (Modalita' Manuale)",
    what: "Estrae tutti i parametri elaborati nella fase corrente e li copia negli appunti di sistema in un formato compatto.",
    portal_location: "Da incollare direttamente nei campi corrispondenti di www.acquistinretepa.it.",
    what_to_do: "Clicca il pulsante quando stai compilando manualmente la procedura sul sito Consip. Incolla i valori con Ctrl+V senza dover riscrivere cifre o codici a mano.",
    legal_tip: "Previene errori umani di digitazione su CIG, codici FVOE o importi al centesimo."
  },
  dock_agent_payload: {
    category: "SISTEMA DUAL HAND-OFF",
    title: "Payload Agente Autonomo (Modalita' Browser-Use)",
    what: "Genera un oggetto JSON standardizzato contenente l'intero stato della procedura di gara, le istruzioni operative e i parametri normativi.",
    portal_location: "Utilizzato da agenti AI autonomi (script Python con libreria browser-use, Playwright o Puppeteer).",
    what_to_do: "Clicca per aprire la finestra di anteprima. Puoi copiare il JSON o scaricare il file .json per passarlo direttamente all'agente che compilera' il portale Consip automaticamente.",
    legal_tip: "Conforme agli standard di interoperabilita' per automazione d'ufficio gare e audit log."
  },
  dock_save: {
    category: "PERSISTENZA SQLITE 3",
    title: "Salvataggio Avanzamento nel Database",
    what: "Memorizza lo stato di tutte e 4 le fasi nella tabella relazionale 'gare_workflow' del database locale 'gare_consip.db' e aggiorna lo stato della gara.",
    portal_location: "Server locale SQLite 3 (porta 8050).",
    what_to_do: "Clicca in qualsiasi momento per essere certo che i dati inseriti non vadano persi alla chiusura del browser. Anche il pulsante 'Conferma & Avanza' esegue il salvataggio automatico.",
    legal_tip: "Garantisce conformita' alle direttive di conservazione del fascicolo di gara aziendale."
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
    what: "Funzionalita' o campo del Wizard di partecipazione gara.",
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
        ${item.simple_explanation ? `
          <div class="bg-gradient-to-r from-cyan-950/60 to-blue-950/40 p-4 rounded-2xl border border-cyan-500/40 text-cyan-200 space-y-1.5 shadow-md">
            <strong class="text-cyan-300 font-mono text-[11px] uppercase flex items-center gap-1.5 font-bold">
              <span>💡 In parole povere (se non sei del settore):</span>
            </strong>
            <p class="text-slate-100 text-xs font-medium leading-relaxed">${escapeHtml(item.simple_explanation)}</p>
          </div>
        ` : ''}

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
    tender = all.find(t => t.id === 'T1') || all.find(t => new Date(t.deadline) > new Date()) || all[0];
  }

  currentWizardGaraId = tender.id;
  window.switchView("wizard");

  await loadWizardData(currentWizardGaraId, tender);

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
  const tenderAmount = Number(tender.amount) || 0;
  const defQa = typeof WizardRules !== "undefined" && tender.deadline
    ? WizardRules.defaultQaDeadline(tender.deadline)
    : (tender.deadline ? tender.deadline.split("T")[0] : "");

  const initialGuarantee = typeof WizardRules !== "undefined"
    ? WizardRules.computeGuarantee({ base: tenderAmount, ratePct: 2, pmi: true })
    : { amount: Math.round(tenderAmount * 0.01), gross: Math.round(tenderAmount * 0.02), mainReductionPct: 50 };

  const initialEcon = typeof WizardRules !== "undefined"
    ? WizardRules.computeEconomics({ base: tenderAmount, discountPct: 5.5 })
    : { offered: tenderAmount * (1 - 0.055) };

  currentWizardData = {
    gara_id: garaId,
    current_step: 1,
    gara_status: tender.status || "Da Valutare",
    step1_data: {
      cig: tender.cig || "",
      authority: tender.authority || "",
      title: tender.title || "",
      category: tender.category || "IT",
      region: tender.region || "Nazionale",
      amount: tenderAmount,
      deadline: tender.deadline || "",
      rup_name: "",
      qa_deadline: defQa,
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
      garanzia_rate_pct: 2.0,
      garanzia_pmi: true,
      garanzia_riduzione_extra_pct: 0,
      busta_a_fideiussione_importo: initialGuarantee.amount,
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
      busta_c_base_amount: tenderAmount,
      busta_c_discount_pct: 5.5,
      busta_c_offered_price: initialEcon.offered,
      fornitura_senza_posa: false,
      busta_c_manodopera: Math.round(tenderAmount * 0.25),
      busta_c_sicurezza: Math.round(tenderAmount * 0.02),
      offerta_inviata: false,
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

  currentWizardData.notes = [];
  if (liveBackendConnected && typeof Api !== "undefined" && Api.getNotes) {
    try {
      const notes = await Api.getNotes(garaId);
      if (Array.isArray(notes)) currentWizardData.notes = notes;
    } catch (e) {
      console.warn("Impossibile caricare note dal backend:", e);
    }
  }

  if (liveBackendConnected && typeof Api !== "undefined" && Api.getWorkflow) {
    try {
      const remote = await Api.getWorkflow(garaId);
      if (remote && remote.gara_id) {
        currentWizardData.current_step = remote.current_step || 1;
        if (remote.gara_status) currentWizardData.gara_status = remote.gara_status;
        if (remote.step1_data && Object.keys(remote.step1_data).length > 0) currentWizardData.step1_data = { ...currentWizardData.step1_data, ...remote.step1_data };
        if (remote.step2_data && Object.keys(remote.step2_data).length > 0) currentWizardData.step2_data = { ...currentWizardData.step2_data, ...remote.step2_data };
        if (remote.step3_data && Object.keys(remote.step3_data).length > 0) currentWizardData.step3_data = { ...currentWizardData.step3_data, ...remote.step3_data };
        if (remote.step4_data && Object.keys(remote.step4_data).length > 0) currentWizardData.step4_data = { ...currentWizardData.step4_data, ...remote.step4_data };
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

  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  
  // Derivazione deterministica dello stato della gara
  let derivedStatus = tender.status;
  if (typeof WizardRules !== "undefined") {
    derivedStatus = WizardRules.deriveGaraStatus(currentWizardData, tender.status);
    currentWizardData.gara_status = derivedStatus;
    if (tender.status !== derivedStatus) {
      tender.status = derivedStatus;
      if (typeof updateTenderInSQLite === "function") {
        updateTenderInSQLite(tender);
      }
    }
  }

  currentWizardData.current_step = currentWizardStep;
  currentWizardData.updated_at = new Date().toISOString();

  if (liveBackendConnected && typeof Api !== "undefined" && Api.saveWorkflow) {
    try {
      await Api.saveWorkflow(currentWizardData);
    } catch (e) {
      console.error("Errore salvataggio workflow su backend:", e);
    }
  }

  showNotification("Avanzamento del Workflow memorizzato in SQLite 3 (Stato: " + (derivedStatus || 'Invariato') + ")");
};

/**
 * Mostra dialogo accessibile di blocco transizione se una fase precedente e' incompleta o NO-GO
 */
window.showStepBlockedModal = function(targetStep, errors) {
  const errorItems = (errors || []).map(e => `<li class="flex items-start gap-2"><span>⚠️</span><span>${escapeHtml(e.msg || e)}</span></li>`).join('');
  const msgHtml = `
    <div class="space-y-3 text-xs leading-relaxed">
      <p class="text-rose-300 font-semibold">Non e' possibile accedere alla Fase ${targetStep} finche' le fasi precedenti non sono state completate correttamente:</p>
      <ul class="space-y-1.5 p-3 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-200">
        ${errorItems || '<li>Verifica i dati della fase precedente.</li>'}
      </ul>
      <p class="text-slate-400">Risolvi le criticita' segnalate prima di avanzare nel workflow deterministico.</p>
    </div>
  `;

  if (typeof window.showInfoDialog === "function") {
    window.showInfoDialog({
      title: `Accesso Bloccato alla Fase ${targetStep}`,
      message: msgHtml
    });
  } else {
    alert(`Fase ${targetStep} bloccata: ` + (errors || []).map(e => e.msg).join('\n'));
  }
};

/**
 * Renderizza l'intera schermata del Wizard con UI rinnovata, accessibile e interattiva
 */
function renderWizardView(tender) {
  const container = document.getElementById("view-wizard");
  if (!container) return;

  const rem = calculateTimeRemaining(tender.deadline);
  
  const s2 = currentWizardData.step2_data || {};
  const s3 = currentWizardData.step3_data || {};
  const s4 = currentWizardData.step4_data || {};

  // Validazione dello step corrente tramite WizardRules
  const valResult = typeof WizardRules !== "undefined"
    ? WizardRules.validateStep(currentWizardStep, currentWizardData)
    : { errors: [], warnings: [], ok: true };

  // Definizione degli step e dei loro vincoli di accesso (gating)
  const stepStatus = [
    { num: 1, title: "1. Identificazione", sub: "CIG & Scadenze Portale", statusText: currentWizardStep > 1 ? "Completato" : "In compilazione", badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" },
    { num: 2, title: "2. Qualificazione", sub: "Idoneita' Go / No-Go", statusText: s2.go_decision === 'GO' ? "Deliberato: GO" : (s2.go_decision === 'NO_GO' ? "Scartata: NO-GO" : "Da valutare"), badge: s2.go_decision === 'GO' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : (s2.go_decision === 'NO_GO' ? "bg-rose-500/10 text-rose-400 border-rose-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30") },
    { num: 3, title: "3. Le 3 Buste", sub: "Busta A, B & C", statusText: s3.offerta_inviata ? "Offerta Inviata" : (s3.busta_a_dgue_ready ? "Buste avviate" : "Bozza da firmare"), badge: s3.offerta_inviata ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-purple-500/10 text-purple-400 border-purple-500/30" },
    { num: 4, title: "4. Esito & Svincolo", sub: "Chiusura & Polizze", statusText: s4.outcome || "In attesa", badge: "bg-slate-500/10 text-slate-400 border-slate-700" }
  ];

  // Calcolo avanzamento complessivo in percentuale (25%, 50%, 75%, 100%)
  const progressPercent = Math.min(100, Math.round((currentWizardStep / 4) * 100));

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- TOP COMMAND BAR & GARA SELECTION -->
      <div class="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
        <div class="absolute -top-24 -right-24 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex items-start sm:items-center gap-4 relative z-10">
          <button onclick="window.switchView('cruscotto')" class="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition shadow-sm touch-target-action shrink-0 border border-slate-700" title="Torna al Cruscotto delle Gare">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          
          <div class="space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold bg-cyan-950/70 border border-cyan-800/80 px-2.5 py-0.5 rounded-lg shadow-inner">
                WIZARD DETERMINISTICO MEPA &bull; D.LGS. 36/2023
              </span>
              <button type="button" onclick="navigator.clipboard.writeText('${escapeHtml(tender.cig || '')}'); showNotification('CIG ${escapeHtml(tender.cig || '')} copiato negli appunti!');" class="group inline-flex items-center gap-1.5 text-xs font-mono font-bold text-white bg-slate-950 hover:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-700/80 transition cursor-pointer" title="Clicca per copiare il CIG">
                <span>${escapeHtml(tender.cig || 'CIG N/D')}</span>
                <svg class="w-3 h-3 text-slate-400 group-hover:text-cyan-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
              <span class="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg border ${tender.status === 'Vinta' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : (tender.status === 'Scartata' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : (tender.status === 'In Lavorazione' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'bg-slate-800 text-cyan-300 border-slate-700'))}">
                ${escapeHtml(tender.status || 'Da Valutare')}
              </span>
              <button onclick="window.showWizardHelpModal('general_wizard')" class="px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-cyan-500 hover:text-slate-950 text-cyan-400 text-[11px] font-semibold border border-slate-700 transition flex items-center gap-1">
                <span>Come funziona?</span>
                <span class="font-bold">?</span>
              </button>
            </div>
            <h2 class="text-sm sm:text-base lg:text-lg font-bold text-white tracking-tight line-clamp-2 max-w-2xl md:max-w-3xl">${escapeHtml(tender.title || 'Procedura di gara')}</h2>
            <div class="text-xs text-slate-400 font-mono flex flex-wrap items-center gap-x-4 gap-y-1">
              <span class="flex items-center gap-1.5">🏛️ <span class="text-slate-300">${escapeHtml(tender.authority || 'Ente Appaltante')}</span></span>
              <span class="flex items-center gap-1.5">💶 <strong class="text-emerald-400 font-bold">${formatEUR(tender.amount)}</strong></span>
              <span class="flex items-center gap-1.5 px-2 py-0.5 rounded-md ${rem.urgent ? 'bg-rose-500/10 text-rose-400 font-bold border border-rose-500/30' : (rem.days < 7 ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' : 'bg-slate-800/60 text-slate-300 border border-slate-700')}">
                ⏰ ${rem.text}
              </span>
            </div>
          </div>
        </div>

        <!-- Selettore rapido di Gara & Salvataggio -->
        <div class="flex items-center gap-2.5 flex-wrap self-end lg:self-center relative z-10">
          <div class="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-2xl px-3 py-1.5 shadow-inner">
            <label class="text-[11px] text-slate-400 font-mono hidden sm:inline">Gara:</label>
            <select id="selectWizardTender" onchange="window.openTenderWizard(this.value)" class="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer max-w-[220px] sm:max-w-xs truncate">
              ${getAllTendersFromSQLite().map(t => `
                <option value="${escapeHtml(t.id)}" ${t.id === tender.id ? 'selected' : ''}>${escapeHtml(t.cig || t.id)} - ${escapeHtml(t.authority ? t.authority.substring(0, 18) : 'Gara')} (${formatEUR(t.amount)})</option>
              `).join('')}
            </select>
          </div>

          <!-- Bottone Esporta Calendario .ics -->
          <button onclick="window.exportCurrentTenderIcs()" class="px-3.5 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs transition flex items-center gap-1.5 border border-slate-700 shadow-sm cursor-pointer" title="Scarica evento .ics per Microsoft Outlook o Google Calendar">
            <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <span class="hidden sm:inline">Calendario (.ics)</span>
          </button>

          <button onclick="window.saveCurrentWizardState()" class="px-4 py-2 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-cyan-500/20 cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
            <span>Salva Avanzamento</span>
          </button>
        </div>
      </div>

      <!-- STEPPER ORIZZONTALE CON PROGRESS TRACK E NODI COLLEGATI -->
      <div class="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3.5">
        
        <!-- Barra di Avanzamento Sequenziale Continua -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span>Avanzamento del Workflow Deterministico:</span>
            </span>
            <span class="font-bold text-cyan-400">${progressPercent}% Completato</span>
          </div>
          <div class="w-full bg-slate-950 h-2 rounded-full border border-slate-800 overflow-hidden p-0.5">
            <div class="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-500 ease-out" style="width: ${progressPercent}%;"></div>
          </div>
        </div>

        <!-- Griglia dei 4 Step con Connettori Logici -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          ${stepStatus.map(s => {
            const isCompleted = s.num < currentWizardStep;
            const isCurrent = s.num === currentWizardStep;
            
            // Verifica di gating per determinare se lo step e' accessibile
            const canEnter = typeof WizardRules !== "undefined"
              ? WizardRules.canEnterStep(s.num, currentWizardData)
              : { ok: true, errors: [] };

            const isLocked = !canEnter.ok && s.num > currentWizardStep;
            
            let cardBg = "bg-slate-950/70 border-slate-800/90 text-slate-400 hover:border-slate-700 hover:bg-slate-950";
            let badgeBg = "bg-slate-800 text-slate-400";
            let iconText = s.num;
            
            if (isCurrent) {
              cardBg = "bg-cyan-950/40 border-cyan-500/70 text-white ring-1 ring-cyan-500/40 shadow-lg shadow-cyan-950/50";
              badgeBg = "bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/30";
              iconText = s.num;
            } else if (isCompleted) {
              cardBg = "bg-emerald-950/20 border-emerald-500/50 text-emerald-200 hover:border-emerald-400";
              badgeBg = "bg-emerald-500 text-slate-950 font-bold";
              iconText = "✓";
            } else if (isLocked) {
              cardBg = "bg-slate-950/40 border-slate-900 text-slate-600 opacity-60";
              badgeBg = "bg-slate-900 text-slate-600 border border-slate-800";
              iconText = "🔒";
            }

            return `
              <button type="button" 
                      onclick="${isLocked ? `window.showStepBlockedModal(${s.num}, ${escapeHtml(JSON.stringify(canEnter.errors))})` : `window.setWizardStep(${s.num})`}" 
                      class="text-left p-3.5 rounded-2xl border ${cardBg} transition-all duration-200 flex items-center justify-between gap-3 group cursor-pointer relative overflow-hidden">
                ${isCurrent ? '<div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 to-blue-500"></div>' : ''}
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center font-mono text-xs ${badgeBg} shrink-0 transition-transform group-hover:scale-105">
                    ${iconText}
                  </div>
                  <div class="truncate">
                    <div class="text-xs font-bold leading-tight truncate ${isCurrent ? 'text-white' : (isLocked ? 'text-slate-500' : 'text-slate-200')}">${s.title}</div>
                    <div class="text-[10px] ${isLocked ? 'text-slate-600' : 'text-slate-400'} truncate mt-0.5">${s.sub}</div>
                  </div>
                </div>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border ${s.badge} shrink-0 hidden md:inline-block">
                  ${s.statusText}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- BANNER ERRORI E AVVISI DETERMINISTICI DELLO STEP CORRENTE -->
      ${valResult.errors.length > 0 || valResult.warnings.length > 0 ? `
        <div class="space-y-2.5">
          ${valResult.errors.length > 0 ? `
            <div class="p-4 rounded-3xl bg-rose-950/40 border border-rose-500/50 text-rose-200 text-xs space-y-1.5 shadow-xl shadow-rose-950/20 backdrop-blur-sm">
              <div class="flex items-center gap-2 font-bold text-rose-300">
                <span class="text-base">🚫</span>
                <span>Elementi Bloccanti per la Fase ${currentWizardStep} (D.Lgs. 36/2023):</span>
              </div>
              <ul class="list-disc list-inside space-y-1 pl-1 text-[11px] text-rose-200/90 font-mono">
                ${valResult.errors.map(e => `<li><strong>${escapeHtml(e.msg)}</strong></li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${valResult.warnings.length > 0 ? `
            <div class="p-3.5 rounded-3xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs space-y-1 backdrop-blur-sm">
              <div class="flex items-center gap-2 font-bold text-amber-300">
                <span>⚠️</span>
                <span>Avvertenze Operative Ufficio Gare:</span>
              </div>
              <ul class="list-disc list-inside space-y-0.5 pl-1 text-[11px] text-amber-300/80 font-mono">
                ${valResult.warnings.map(w => `<li>${escapeHtml(w.msg)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- WORK AREA DELLO STEP CORRENTE CON GUIDA OPERATIVA INTEGRATA -->
      <div id="wizardStepContent" class="space-y-6">
        ${renderCurrentStepContent(tender)}
      </div>

      <!-- SEZIONE NOTE & DIARIO DI BORDO GARA (COLLASSABILE & CRONOLOGICA) -->
      <div class="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-sm">📋</span>
            <div>
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>Diario di Bordo &amp; Note Interne Ufficio Gare</span>
                <span id="notesCountBadge" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-bold border border-slate-700">${(currentWizardData.notes || []).length} note</span>
              </h3>
              <p class="text-[11px] text-slate-400 font-mono">Annotazioni strategiche, chiarimenti inviati, verbali e delibere (persistenza SQLite 3)</p>
            </div>
          </div>
          ${renderHelpBtn('notes_log')}
        </div>

        <!-- Form Inserimento Rapido Nota -->
        <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 shadow-inner">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <label class="text-[11px] font-mono text-slate-400">Categoria:</label>
              <select id="newNoteCategory" class="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-200 focus:border-cyan-400 cursor-pointer">
                <option value="GENERALE">📌 Generale</option>
                <option value="Q&A">❓ Chiarimenti Q&amp;A</option>
                <option value="GO_NOGO">⚖️ Delibera Go/No-Go</option>
                <option value="BUSTE">📁 Predisposizione Buste</option>
                <option value="ESITO">🏆 Esito / Svincolo Polizza</option>
              </select>
            </div>
            <button type="button" onclick="window.addNewGaraNote()" class="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 self-end sm:self-auto cursor-pointer shadow-md shadow-cyan-500/20">
              <span>+ Aggiungi al Diario</span>
            </button>
          </div>
          <textarea id="newNoteContent" rows="2" placeholder="Scrivi un'annotazione, risposta a quesito, decisione o appunto di gara..." class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400 leading-relaxed"></textarea>
        </div>

        <!-- Elenco Note Cronologiche -->
        <div id="garaNotesListContainer" class="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
          ${renderGaraNotesListHtml(currentWizardData.notes || [])}
        </div>
      </div>

      <!-- DOCK AZIONI RAPIDE INFERIORE (NAVIGAZIONE & DUAL HAND-OFF) -->
      <div class="bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-3xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl sticky bottom-4 z-20">
        
        <!-- Pulsanti Spostamento Step -->
        <div class="flex items-center gap-2 w-full md:w-auto">
          <button onclick="window.setWizardStep(${Math.max(1, currentWizardStep - 1)})" ${currentWizardStep === 1 ? 'disabled' : ''} class="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed font-semibold text-xs transition border border-slate-700 flex items-center gap-1.5 cursor-pointer">
            <span>← Fase Precedente</span>
          </button>
          
          <button onclick="window.setWizardStep(${Math.min(4, currentWizardStep + 1)})" ${currentWizardStep === 4 ? 'disabled' : ''} class="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed font-semibold text-xs transition border border-slate-700 flex items-center gap-1.5 cursor-pointer">
            <span>Fase Successiva →</span>
          </button>
        </div>

        <!-- Indicatore compatto fase corrente (Centro) -->
        <div class="hidden lg:flex items-center gap-2 font-mono text-xs text-slate-400 bg-slate-900 px-3.5 py-2 rounded-2xl border border-slate-800">
          <span class="w-2 h-2 rounded-full ${currentWizardStep === 4 ? 'bg-emerald-400' : 'bg-cyan-400'} animate-pulse"></span>
          <span>Fase ${currentWizardStep} di 4: <strong class="text-white">${stepStatus[currentWizardStep - 1].title.replace(/^\d+\.\s*/, '')}</strong></span>
        </div>

        <!-- Tasti Dual Hand-Off & Avanzamento (Destra) -->
        <div class="flex items-center gap-2.5 flex-wrap w-full md:w-auto justify-end">
          
          <!-- Copia Rapida Portale (Manuale) con info -->
          <div class="flex items-center">
            <button onclick="window.copyStepValuesForPortal()" class="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-cyan-300 font-mono text-xs font-semibold transition flex items-center gap-2 shadow-sm cursor-pointer" title="Copia negli appunti i parametri pronti per acquistinretepa.it">
              <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
              <span id="btnCopyStepLabel">Copia Dati per Portale Consip</span>
            </button>
            ${renderHelpBtn('dock_copy_portal')}
          </div>

          <!-- Payload Agente (Browser-Use) con info -->
          <div class="flex items-center">
            <button onclick="window.openAgentExportModal()" class="px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-900/50 to-indigo-900/50 hover:from-purple-900/70 hover:to-indigo-900/70 border border-purple-500/40 text-purple-200 font-mono text-xs font-semibold transition flex items-center gap-2 shadow-sm cursor-pointer" title="Esporta JSON strutturato per automazione web">
              <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              <span>Payload Agente (Browser-Use)</span>
            </button>
            ${renderHelpBtn('dock_agent_payload')}
          </div>

          <!-- Conferma & Salva -->
          <button onclick="window.advanceStepAndSave()" class="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs transition flex items-center gap-2 shadow-lg shadow-cyan-500/25 cursor-pointer">
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
    const cigValidation = typeof WizardRules !== "undefined"
      ? WizardRules.validateCig(d.step1_data.cig)
      : { ok: !!d.step1_data.cig, msg: "" };

    return `
      <!-- BANNER GUIDA DELLA FASE 1 -->
      <div class="bg-gradient-to-br from-cyan-950/60 via-slate-900 to-slate-950 border border-cyan-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between border-b border-cyan-500/20 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-md shadow-cyan-500/30">1</span>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>🎯 Cosa devi fare in questa Fase 1: Identificazione e Setup Bando</span>
              </h3>
              <span class="text-[11px] text-cyan-300 font-mono">D.Lgs. 36/2023 &bull; Termini di Chiarimento Q&A e Scadenza Offerte</span>
            </div>
          </div>
          <a href="${escapeHtml(d.step1_data.link || 'https://www.acquistinretepa.it')}" target="_blank" rel="noopener noreferrer" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-mono inline-flex items-center gap-1.5 border border-slate-700 shadow-sm transition">
            <span>Apri su acquistinretepa.it ↗</span>
          </a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-cyan-400 block font-mono text-[11px] mb-1">Passo 1.1: Verifica il CIG</strong>
            <p class="text-slate-300 leading-relaxed">Controlla che il codice CIG a 10 caratteri corrisponda esattamente al bando pubblicato su MePA. Ti servira' per il FVOE 2.0 e la fideiussione.</p>
          </div>
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-amber-400 block font-mono text-[11px] mb-1">Passo 1.2: Termine Quesiti (Q&A)</strong>
            <p class="text-slate-300 leading-relaxed">Verifica quando scadono le richieste di chiarimento (art. 92 c.2). Invia subito eventuali quesiti tecnici su MePA prima del termine!</p>
          </div>
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-emerald-400 block font-mono text-[11px] mb-1">Passo 1.3: Assegna il RUP</strong>
            <p class="text-slate-300 leading-relaxed">Identifica il Responsabile Unico del Progetto indicato nel disciplinare per intestare garanzie e successive comunicazioni PEC.</p>
          </div>
        </div>
      </div>

      <!-- WORKSPACE A DUE COLONNE: FORM A SINISTRA, FASCICOLO DIGITALE A DESTRA -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        
        <!-- Colonna Principale: Form Dati Bando & Cronoprogramma (2 Colonne Desktop) -->
        <div class="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-5">
          <div class="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 pb-2.5 flex items-center justify-between">
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>Dati Ufficiali del Bando &amp; Cronoprogramma</span>
            </span>
            <span class="text-[11px] text-slate-500 font-normal">Tutti i campi con (?) includono guida operativa</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <!-- CIG -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 shadow-inner">
              <label class="flex items-center text-slate-300 font-semibold">
                <span>Codice Identificativo Gara (CIG):</span>
                ${renderHelpBtn('cig')}
              </label>
              <div class="flex gap-1.5">
                <input id="w_cig" type="text" maxlength="10" value="${escapeHtml(d.step1_data.cig)}" oninput="this.value = this.value.toUpperCase();" class="w-full bg-slate-900 border ${cigValidation.ok ? 'border-slate-800 focus:border-cyan-400' : 'border-rose-500/80 focus:border-rose-400'} rounded-xl px-3 py-2 text-cyan-400 font-mono font-bold text-xs uppercase">
                <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('w_cig').value); showNotification('CIG copiato negli appunti!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] shrink-0 border border-slate-700" title="Copia CIG">Copia</button>
              </div>
              <span class="text-[10px] ${cigValidation.ok ? 'text-slate-500' : 'text-rose-400'} font-mono block">
                ${cigValidation.ok ? '✓ Esattamente 10 caratteri alfanumerici (ANAC BDNCP)' : escapeHtml(cigValidation.msg)}
              </span>
            </div>

            <!-- Termine Domande Q&A -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 shadow-inner">
              <div class="flex items-center justify-between">
                <label class="flex items-center text-slate-300 font-semibold">
                  <span>Scadenza Chiarimenti (Q&A):</span>
                  ${renderHelpBtn('qa_deadline')}
                </label>
                <button type="button" onclick="window.autoSuggestQaDeadline()" class="text-[10px] text-cyan-400 hover:underline font-mono" title="Calcola 10 giorni prima della scadenza offerta">Auto (-10gg)</button>
              </div>
              <input id="w_qa_deadline" type="date" value="${escapeHtml(d.step1_data.qa_deadline)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs focus:border-cyan-400">
              <div class="flex items-center justify-between pt-1">
                <span class="text-[10px] text-slate-500 font-mono">Art. 92 c.2: risposte PA &ge;6gg prima</span>
                <button type="button" onclick="window.openQaFacsimileModal()" class="text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline flex items-center gap-1 cursor-pointer">
                  <span>📝 Genera Fac-Simile Quesito</span>
                </button>
              </div>
            </div>

            <!-- Scadenza Presentazione -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 shadow-inner">
              <label class="flex items-center text-slate-300 font-semibold">
                <span>Scadenza Presentazione Offerta:</span>
                ${renderHelpBtn('deadline')}
              </label>
              <input id="w_deadline" type="datetime-local" value="${escapeHtml(d.step1_data.deadline ? d.step1_data.deadline.substring(0, 16) : '')}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-rose-300 font-mono font-bold text-xs focus:border-cyan-400">
              <span class="text-[10px] text-slate-500 font-mono">Termine perentorio non prorogabile a sistema</span>
            </div>

            <!-- RUP -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 shadow-inner">
              <label class="flex items-center text-slate-300 font-semibold">
                <span>RUP (Responsabile Unico del Progetto):</span>
                ${renderHelpBtn('rup_name')}
              </label>
              <input id="w_rup_name" type="text" placeholder="Nome RUP dal disciplinare..." value="${escapeHtml(d.step1_data.rup_name || '')}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">
              <span class="text-[10px] text-slate-500 font-mono">Referente unico istituzionale per la procedura</span>
            </div>

            <!-- Stazione Appaltante -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 shadow-inner md:col-span-2">
              <label class="flex items-center text-slate-300 font-semibold">
                <span>Stazione Appaltante / Amministrazione:</span>
                ${renderHelpBtn('authority')}
              </label>
              <input id="w_authority" type="text" value="${escapeHtml(d.step1_data.authority)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">
              <span class="text-[10px] text-slate-500 font-mono">Ente committente titolare del bando su piattaforma MePA</span>
            </div>

            <!-- Oggetto della Gara -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 shadow-inner md:col-span-2">
              <label class="flex items-center text-slate-300 font-semibold">
                <span>Oggetto Fornitura / Servizio:</span>
                ${renderHelpBtn('title')}
              </label>
              <textarea id="w_title" rows="2" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400 leading-relaxed">${escapeHtml(d.step1_data.title)}</textarea>
              <span class="text-[10px] text-slate-500 font-mono">Verifica piena conformita' merceologica con i codici ATECO aziendali</span>
            </div>
          </div>
        </div>

        <!-- Colonna Laterale: Fascicolo Digitale & Download Bando (1 Colonna Desktop) -->
        <div class="space-y-4">
          <div class="bg-slate-900/90 p-5 rounded-3xl border border-cyan-500/30 space-y-3 shadow-xl">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-xs">📥</span>
                <div>
                  <h4 class="text-xs font-bold text-white">Fascicolo Bando &amp; Export</h4>
                  <span class="text-[10px] text-slate-400 font-mono">Download documenti immediati</span>
                </div>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">1-Click</span>
            </div>

            <div class="space-y-2 text-xs">
              <!-- 1. Scheda Bando Markdown -->
              <button type="button" onclick="window.downloadFase1Scheda('md')" class="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition group cursor-pointer shadow-sm">
                <div class="flex items-center justify-between text-xs mb-1">
                  <span class="font-bold text-slate-200 group-hover:text-cyan-300">📋 Scheda Bando</span>
                  <span class="font-mono text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">.MD</span>
                </div>
                <p class="text-[11px] text-slate-400 leading-tight">Riepilogo scadenze perentorie, RUP e note legali in Markdown.</p>
              </button>

              <!-- 2. Scheda Bando Word -->
              <button type="button" onclick="window.downloadFase1Scheda('docx')" class="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition group cursor-pointer shadow-sm">
                <div class="flex items-center justify-between text-xs mb-1">
                  <span class="font-bold text-slate-200 group-hover:text-cyan-300">📄 Scheda Word</span>
                  <span class="font-mono text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">.DOCX</span>
                </div>
                <p class="text-[11px] text-slate-400 leading-tight">Documento Word formattato per archiviazione nel fascicolo d'appalto.</p>
              </button>

              <!-- 3. Calendario iCalendar -->
              <button type="button" onclick="window.exportCurrentTenderIcs()" class="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition group cursor-pointer shadow-sm">
                <div class="flex items-center justify-between text-xs mb-1">
                  <span class="font-bold text-slate-200 group-hover:text-cyan-300">📅 Calendario Alert</span>
                  <span class="font-mono text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">.ICS</span>
                </div>
                <p class="text-[11px] text-slate-400 leading-tight">Evento scadenze per Microsoft Outlook, Google e Apple Calendar.</p>
              </button>
            </div>
          </div>

          <!-- Promemoria Normativo Rapido -->
          <div class="bg-slate-950 p-4 rounded-3xl border border-slate-800 space-y-2 text-xs">
            <div class="flex items-center gap-2 text-cyan-400 font-mono font-bold text-[11px]">
              <span>💡 D.Lgs. 36/2023 - Promemoria:</span>
            </div>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              Il mancato rispetto dei termini di presentazione comporta l'inammissibilita' automatica da parte della piattaforma MePA, non sanabile con soccorso istruttorio.
            </p>
          </div>
        </div>

      </div>
    `;
  }

  // -------------------------------------------------------------
  // FASE 2: VALUTAZIONE IDONEITA' & DELIBERA GO / NO-GO
  // -------------------------------------------------------------
  if (currentWizardStep === 2) {
    const s2 = d.step2_data || {};
    const marginTarget = s2.margin_estimated_pct || 12.5;
    
    return `
      <!-- BANNER GUIDA DELLA FASE 2 -->
      <div class="bg-gradient-to-br from-amber-950/60 via-slate-900 to-slate-950 border border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between border-b border-amber-500/20 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-md shadow-amber-500/30">2</span>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>🎯 Cosa devi fare in questa Fase 2: Valutazione Idoneita' &amp; Delibera Go / No-Go</span>
              </h3>
              <span class="text-[11px] text-amber-300 font-mono">Analisi di Convenienza &bull; Checklist Requisiti Giuridici ed Economici</span>
            </div>
          </div>
          <button onclick="window.showWizardHelpModal('go_decision')" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-mono inline-flex items-center gap-1.5 border border-slate-700 shadow-sm transition">
            <span>Guida Delibera ?</span>
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-amber-400 block font-mono text-[11px] mb-1">Passo 2.1: Spunta i 4 Pilastri</strong>
            <p class="text-slate-300 leading-relaxed">Verifica fatturato triennale, certificazioni ISO (riduzione 30% cauzione), sopralluogo e capienza castelletto garanzie.</p>
          </div>
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-emerald-400 block font-mono text-[11px] mb-1">Passo 2.2: Stima la Marginalita'</strong>
            <p class="text-slate-300 leading-relaxed">Imposta il margine operativo netto stimato. Un margine sotto l'8% e' ad alto rischio di perdita o anomalia dell'offerta.</p>
          </div>
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <strong class="text-cyan-400 block font-mono text-[11px] mb-1">Passo 2.3: Delibera Strategica</strong>
            <p class="text-slate-300 leading-relaxed">Seleziona 🟢 GO per proseguire con le buste, oppure 🔴 NO-GO per scartarla subito ed evitare sprechi di risorse.</p>
          </div>
        </div>
      </div>

      <!-- WORKSPACE FASE 2: I 4 PILASTRI A SINISTRA, MARGINE E DELIBERA A DESTRA -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        
        <!-- I 4 PILASTRI DI QUALIFICAZIONE -->
        <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
          <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
            <span class="font-mono font-bold text-amber-400 uppercase text-xs flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>I 4 Pilastri di Qualificazione (D.Lgs. 36/2023 art. 100)</span>
            </span>
            <span class="text-[10px] text-slate-500 font-mono">Requisiti Speciali</span>
          </div>

          <div class="space-y-3">
            <!-- Pilastro 1: Fatturato -->
            <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition shadow-inner">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_check_fatturato" type="checkbox" ${s2.check_fatturato ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
                <div class="flex-1">
                  <div class="flex items-center">
                    <strong class="text-slate-200">1. Fatturato Specifico nel Settore</strong>
                    ${renderHelpBtn('check_fatturato')}
                  </div>
                  <span class="text-[11px] text-slate-400 block mt-0.5">Fatturato negli ultimi 3 esercizi idoneo a coprire quanto richiesto dal bando.</span>
                  <button type="button" onclick="window.openFatturatoModal()" class="mt-2 px-2.5 py-1 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-mono text-[11px] border border-cyan-500/30 inline-flex items-center gap-1.5 transition cursor-pointer">
                    <span>⚡ Pipeline Verifica Requisito Fatturato (art. 100)</span>
                  </button>
                </div>
              </label>
            </div>

            <!-- Pilastro 2: ISO 9001 -->
            <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition shadow-inner">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_check_iso" type="checkbox" ${s2.check_iso ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
                <div class="flex-1">
                  <div class="flex items-center">
                    <strong class="text-slate-200">2. Certificazioni di Qualita' (ISO 9001 / CAM)</strong>
                    ${renderHelpBtn('check_iso')}
                  </div>
                  <span class="text-[11px] text-slate-400 block mt-0.5">ISO 9001 valida (riduzione 30% cauzione provvisoria ex art. 106 c.8).</span>
                  <button type="button" onclick="window.openCertificazioniModal()" class="mt-2 px-2.5 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-mono text-[11px] border border-amber-500/30 inline-flex items-center gap-1.5 transition cursor-pointer">
                    <span>⚡ Verifica Certificazioni &amp; Taglio Cauzione (-30%)</span>
                  </button>
                </div>
              </label>
            </div>

            <!-- Pilastro 3: Sopralluogo -->
            <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition shadow-inner">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_check_sopralluogo" type="checkbox" ${s2.check_sopralluogo ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
                <div class="flex-1">
                  <div class="flex items-center">
                    <strong class="text-slate-200">3. Sopralluogo Obbligatorio (ove prescritto)</strong>
                    ${renderHelpBtn('check_sopralluogo')}
                  </div>
                  <span class="text-[11px] text-slate-400 block mt-0.5">Attestato di sopralluogo rilasciato dal RUP dell'ente (se richiesto dal bando).</span>
                  <button type="button" onclick="window.openSopralluogoModal()" class="mt-2 px-2.5 py-1 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-mono text-[11px] border border-purple-500/30 inline-flex items-center gap-1.5 transition cursor-pointer">
                    <span>⚡ Guida Sopralluogo &amp; Generatore Richiesta Appuntamento</span>
                  </button>
                </div>
              </label>
            </div>

            <!-- Pilastro 4: Garanzie e Fidi -->
            <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition shadow-inner">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_check_garanzie" type="checkbox" ${s2.check_garanzie ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
                <div class="flex-1">
                  <div class="flex items-center">
                    <strong class="text-slate-200">4. Fido Assicurativo / Castelletto Fideiussorio</strong>
                    ${renderHelpBtn('check_garanzie')}
                  </div>
                  <span class="text-[11px] text-slate-400 block mt-0.5">Capienza confermata per emissione cauzione provvisoria e futura definitiva.</span>
                  <button type="button" onclick="window.openGaranzieModal()" class="mt-2 px-2.5 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-mono text-[11px] border border-emerald-500/30 inline-flex items-center gap-1.5 transition cursor-pointer">
                    <span>⚡ Verifica Capienza Plafond &amp; Richiesta Polizza Broker</span>
                  </button>
                </div>
              </label>
            </div>
          </div>
        </div>

        <!-- DELIBERA GO / NO-GO & MARGINALITA' -->
        <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl flex flex-col justify-between">
          <div class="space-y-4">
            <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
              <span class="font-mono font-bold text-emerald-400 uppercase text-xs flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Stima Margine &amp; Delibera Finale</span>
              </span>
              <span class="text-[10px] text-slate-500 font-mono">Decisione Strategica</span>
            </div>

            <!-- Pulsante Pipeline Business Case Deterministico -->
            <button type="button" onclick="window.openMargineModal()" class="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer">
              <span>⚡ Calcolatore Analitico Margine di Commessa (Business Case)</span>
            </button>

            <!-- Box Margine Operativo Netto Target -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 shadow-inner">
              <label class="flex items-center text-slate-300 font-semibold">
                <span>Margine Operativo Netto Target (%):</span>
                ${renderHelpBtn('margin_pct')}
              </label>
              <div class="flex items-center gap-3">
                <input id="w_margin_pct" type="number" step="0.5" value="${marginTarget}" class="w-32 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold text-sm focus:border-cyan-400">
                <span class="text-[11px] font-mono px-2 py-1 rounded-md ${marginTarget >= 12 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : (marginTarget >= 8 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30')}">
                  ${marginTarget >= 12 ? '🟢 Ottimale (&ge;12%)' : (marginTarget >= 8 ? '🟡 Accettabile (&ge;8%)' : '🔴 Rischio Anomalia (<8%)')}
                </span>
              </div>
            </div>

            <!-- Selettore Esito Delibera Formale -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 shadow-inner">
              <label class="flex items-center text-slate-300 font-semibold">
                <span>Esito Valutazione Formale Ufficio Gare:</span>
                ${renderHelpBtn('go_decision')}
              </label>
              <select id="w_go_decision" onchange="window.handleGoDecisionChange(this.value)" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 font-bold text-xs focus:border-cyan-400 cursor-pointer">
                <option value="GO" ${s2.go_decision === 'GO' ? 'selected' : ''}>🟢 GO — Requisiti ok, procedi con l'offerta</option>
                <option value="NO_GO" ${s2.go_decision === 'NO_GO' ? 'selected' : ''}>🔴 NO-GO — Scarta la gara (blocca avanzamento alle buste)</option>
                <option value="PENDING" ${s2.go_decision === 'PENDING' ? 'selected' : ''}>🟡 IN ATTESA — In attesa di chiarimenti ufficiali dal RUP</option>
              </select>
            </div>

            <!-- Note Strategiche -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 shadow-inner">
              <label class="flex items-center text-slate-300 font-semibold">
                <span>Note Strategiche (RTI, Subappalto, Partner):</span>
                ${renderHelpBtn('step2_notes')}
              </label>
              <textarea id="w_step2_notes" rows="2" placeholder="Annotazioni su RTI, quote fornitura, avvalimento..." class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">${escapeHtml(s2.notes || '')}</textarea>
            </div>
          </div>
        </div>

      </div>

      <!-- CARD DOWNLOAD DOCUMENTI FASE 2 -->
      <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-amber-500/30 space-y-3 shadow-xl">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold text-xs">📥</span>
            <div>
              <h4 class="text-xs sm:text-sm font-bold text-white">Documenti Scaricabili &amp; Fascicolo di Delibera</h4>
              <span class="text-[11px] text-slate-400 font-mono">Esporta verbale formale, foglio di calcolo analitico e dati strutturati</span>
            </div>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">Export Immediato</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 text-xs">
          <!-- 1. Verbale Word/Doc -->
          <button type="button" onclick="window.downloadFase2Verbale('docx')" class="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition group cursor-pointer shadow-sm">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="font-bold text-slate-200 group-hover:text-cyan-300">📄 Verbale Delibera</span>
              <span class="font-mono text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">.DOCX</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-tight">Verbale formale di Go/No-Go per fascicolo aziendale e firma direzione.</p>
          </button>

          <!-- 2. Verbale Markdown -->
          <button type="button" onclick="window.downloadFase2Verbale('md')" class="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition group cursor-pointer shadow-sm">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="font-bold text-slate-200 group-hover:text-cyan-300">📝 Verbale Markdown</span>
              <span class="font-mono text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">.MD</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-tight">Report di qualificazione in formato Markdown interoperabile.</p>
          </button>

          <!-- 3. Business Case Excel CSV -->
          <button type="button" onclick="window.downloadFase2BusinessCaseCsv()" class="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 text-left transition group cursor-pointer shadow-sm">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="font-bold text-slate-200 group-hover:text-emerald-300">📊 Business Case</span>
              <span class="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">.CSV</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-tight">Foglio di calcolo costi commessa, manodopera art. 108 e marginalità.</p>
          </button>

          <!-- 4. Scheda Qualificazione JSON -->
          <button type="button" onclick="window.downloadFase2Json()" class="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-left transition group cursor-pointer shadow-sm">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="font-bold text-slate-200 group-hover:text-purple-300">💾 Dati Qualificazione</span>
              <span class="font-mono text-[10px] text-purple-400 font-bold bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/60">.JSON</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-tight">Dati completi per archiviazione documentale, ERP o agenti AI.</p>
          </button>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // FASE 3: LE 3 BUSTE TELEMATICHE (A, B, C)
  // -------------------------------------------------------------
  if (currentWizardStep === 3) {
    const s3 = d.step3_data || {};
    const activeBusta = s3.active_busta || "A";

    // Calcolo reattivo della garanzia provvisoria
    const tenderAmount = Number(s3.busta_c_base_amount || tender.amount) || 0;
    const guaranteeCalc = typeof WizardRules !== "undefined"
      ? WizardRules.computeGuarantee({
          base: tenderAmount,
          ratePct: s3.garanzia_rate_pct || 2.0,
          iso9001: !!d.step2_data.check_iso,
          pmi: !!s3.garanzia_pmi,
          extraReductionPct: s3.garanzia_riduzione_extra_pct || 0
        })
      : { amount: Math.round(tenderAmount * 0.01), gross: Math.round(tenderAmount * 0.02), mainReductionPct: 50 };

    // Calcolo marginalita' effettiva post-ribasso
    const discountVal = Number(s3.busta_c_discount_pct) || 0;
    const effectiveMargin = typeof WizardRules !== "undefined"
      ? WizardRules.marginAtDiscount(d.step2_data.margin_estimated_pct || 12.5, discountVal)
      : null;

    return `
      <!-- BANNER GUIDA DELLA FASE 3 CON TAB BAR DELLE 3 BUSTE -->
      <div class="bg-gradient-to-br from-purple-950/60 via-slate-900 to-slate-950 border border-purple-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-purple-500/20 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-purple-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-md shadow-purple-500/30">3</span>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>🎯 Predisposizione delle 3 Buste Telematiche</span>
                ${renderHelpBtn('buste_overview')}
              </h3>
              <span class="text-[11px] text-purple-300 font-mono">D.Lgs. 36/2023 &bull; Rigorosa Separazione tra Offerta Tecnica ed Economica</span>
            </div>
          </div>

          <!-- BUSTA SELECTOR TABS -->
          <div class="inline-flex rounded-2xl bg-slate-950 p-1.5 border border-slate-800 text-xs shrink-0 self-start lg:self-auto shadow-inner">
            <button onclick="window.setWizardBustaTab('A')" class="px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${activeBusta === 'A' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}">
              <span>Busta A: Amministrativa</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-md ${activeBusta === 'A' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-cyan-400'}">
                ${s3.busta_a_dgue_ready && s3.busta_a_fideiussione_ready ? '✓' : 'A'}
              </span>
            </button>
            <button onclick="window.setWizardBustaTab('B')" class="px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${activeBusta === 'B' ? 'bg-purple-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}">
              <span>Busta B: Tecnica</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-md ${activeBusta === 'B' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-purple-400'}">
                ${s3.busta_b_ready ? '✓' : 'B'}
              </span>
            </button>
            <button onclick="window.setWizardBustaTab('C')" class="px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${activeBusta === 'C' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}">
              <span>Busta C: Economica</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-md ${activeBusta === 'C' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-emerald-400'}">
                ${s3.offerta_inviata ? '✓' : 'C'}
              </span>
            </button>
          </div>
        </div>

        <div class="p-3 rounded-2xl bg-purple-950/40 border border-purple-800/40 text-purple-200 text-xs leading-relaxed flex items-center gap-2.5">
          <span class="text-base shrink-0">⚠️</span>
          <span><strong>Regola di Esclusione Automatica:</strong> Nessun elemento di prezzo (cifre in euro o percentuali di sconto) deve MAI comparire nella Busta A o Busta B, pena l'esclusione insanabile della gara.</span>
        </div>
      </div>

      <!-- TAB CONTENT: BUSTA A AMMINISTRATIVA -->
      ${activeBusta === 'A' ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          
          <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
            <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
              <span class="font-mono font-bold text-cyan-400 uppercase text-xs flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span>Documenti Amministrativi (Busta A)</span>
              </span>
              <span class="text-[10px] text-slate-500 font-mono">Conformita' e Garanzie</span>
            </div>

            <div class="space-y-3">
              <!-- DGUE -->
              <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner">
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
                <button type="button" onclick="window.openDgueModal()" class="mt-2.5 w-full px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-semibold border border-cyan-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer" title="Verifica guidata requisiti di onorabilità e generazione dichiarazione DGUE">
                  <span>⚡ Procedura Guidata DGUE (ESPD)</span>
                </button>
              </div>

              <!-- SEZIONE CALCOLATORE CAUZIONE PROVVISORIA (ART. 106 C.8) -->
              <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 shadow-inner">
                <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <label class="flex items-start gap-2.5 cursor-pointer">
                    <input id="w_busta_a_fideiussione" type="checkbox" ${s3.busta_a_fideiussione_ready ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
                    <div>
                      <strong class="text-slate-200">Garanzia Provvisoria ex art. 106 D.Lgs. 36/2023</strong>
                      <span class="text-[10px] text-emerald-400 block font-mono">Conferma acquisizione polizza fideiussoria</span>
                    </div>
                  </label>
                  ${renderHelpBtn('busta_a_fideiussione')}
                </div>

                <!-- Parametri Normativi Riduzione Cauzione -->
                <div class="space-y-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-[11px]">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-300">Aliquota base richiesta dal bando:</span>
                    <div class="flex items-center gap-1 font-mono">
                      <input id="w_garanzia_rate" type="number" step="0.1" min="1" max="4" value="${s3.garanzia_rate_pct || 2.0}" onchange="window.recalcGuaranteeFromDOM()" class="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right text-cyan-300 font-bold">
                      <span class="text-slate-400">%</span>
                    </div>
                  </div>

                  <div class="pt-1.5 border-t border-slate-800/60 space-y-1.5">
                    <label class="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input id="w_garanzia_pmi" type="checkbox" ${s3.garanzia_pmi !== false ? 'checked' : ''} onchange="window.recalcGuaranteeFromDOM()" class="rounded bg-slate-950 border-slate-700 text-cyan-500">
                      <span>Micro, Piccola o Media Impresa (PMI) &bull; <strong class="text-emerald-400">-50%</strong></span>
                    </label>

                    <label class="flex items-center gap-2 text-slate-400 cursor-not-allowed" title="Non cumulabile con PMI: prevale la maggiore (50%)">
                      <input id="w_garanzia_iso_info" type="checkbox" ${d.step2_data.check_iso ? 'checked' : ''} disabled class="rounded bg-slate-950 border-slate-800 text-slate-600">
                      <span>ISO 9001 (Fase 2) &bull; <strong>-30%</strong> <em class="text-[10px] text-slate-500">(non cumulabile con PMI)</em></span>
                    </label>

                    <label class="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input id="w_garanzia_digitale" type="checkbox" ${s3.garanzia_riduzione_extra_pct === 10 ? 'checked' : ''} onchange="window.recalcGuaranteeFromDOM()" class="rounded bg-slate-950 border-slate-700 text-cyan-500">
                      <span>Fideiussione telematica verificabile &bull; <strong class="text-emerald-400">-10%</strong></span>
                    </label>
                  </div>

                  <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between font-mono">
                    <span class="text-slate-400">Importo Cauzione Ridotta:</span>
                    <span id="labelGuaranteeAmount" class="text-sm font-bold text-emerald-400">${formatEUR(guaranteeCalc.amount)}</span>
                  </div>
                  <div class="text-[10px] text-slate-500 font-mono text-right">
                    Lorda: ${formatEUR(guaranteeCalc.gross)} &bull; Sconto: ${guaranteeCalc.mainReductionPct}%
                  </div>

                  <button type="button" onclick="window.openBrokerGuaranteeModal()" class="mt-2 w-full px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer" title="Genera testo PEC o email per richiesta polizza al broker assicurativo">
                    <span>⚡ Richiesta Polizza Fideiussoria (Fac-simile Broker)</span>
                  </button>
                </div>
              </div>

              <!-- Codice FVOE 2.0 -->
              <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 shadow-inner">
                <label class="flex items-center text-slate-300 font-semibold">
                  <span>Codice Fascicolo FVOE 2.0 ANAC:</span>
                  ${renderHelpBtn('fvoe_passoe')}
                </label>
                <div class="flex gap-1.5">
                  <input id="w_fvoe_code" type="text" placeholder="Es. FVOE-99214..." value="${escapeHtml(s3.busta_a_fvoe_passoe || '')}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-cyan-300 font-mono text-xs focus:border-cyan-400">
                  <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('w_fvoe_code').value); showNotification('Codice FVOE copiato!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] shrink-0 border border-slate-700">Copia</button>
                </div>
                <span class="text-[10px] text-slate-500 font-mono">Consente all'ente il controllo dei requisiti generali sul Fascicolo Virtuale</span>
                <button type="button" onclick="window.openFvoeModal()" class="mt-2 w-full px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-semibold border border-purple-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer" title="Guida passo-passo per generare il codice FVOE sul portale ANAC">
                  <span>⚡ Assistente FVOE 2.0 ANAC</span>
                </button>
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

            <p class="text-[11px] text-slate-400 leading-relaxed">Rinomina i documenti con la seguente nomenclatura prima di apporre la firma digitale:</p>
            
            <div class="space-y-2.5">
              ${(s3.busta_a_files || []).map((file, idx) => `
                <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 shadow-inner">
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
              <span class="font-mono font-bold text-purple-400 uppercase text-xs flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                <span>Offerta Tecnica &amp; CAM (Busta B)</span>
              </span>
              <span class="text-[10px] text-slate-500 font-mono">Qualita' e Punteggi</span>
            </div>

            <div class="space-y-3">
              <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner">
                <label class="flex items-start gap-2.5 cursor-pointer">
                  <input id="w_busta_b_ready" type="checkbox" ${s3.busta_b_ready ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-purple-500 mt-0.5">
                  <div class="flex-1">
                    <div class="flex items-center">
                      <strong class="text-slate-200">Relazione Tecnica Descrittiva Completa</strong>
                      ${renderHelpBtn('busta_b_ready')}
                    </div>
                    <span class="text-[11px] text-slate-400 block mt-0.5">Impaginata rigorosamente entro il limite massimo di pagine prescritto dal disciplinare.</span>
                  </div>
                </label>
                <button type="button" onclick="window.openBustaBCheckModal()" class="mt-2.5 w-full px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-semibold border border-purple-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer" title="Checklist pre-invio e struttura proposta tecnica">
                  <span>⚡ Guida &amp; Checklist Busta Tecnica</span>
                </button>
              </div>

              <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner">
                <label class="flex items-start gap-2.5 cursor-pointer">
                  <input id="w_busta_b_cam" type="checkbox" ${s3.busta_b_criteri_cam ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-purple-500 mt-0.5">
                  <div class="flex-1">
                    <div class="flex items-center">
                      <strong class="text-slate-200">Criteri Ambientali Minimi (CAM) &amp; Premialita'</strong>
                      ${renderHelpBtn('busta_b_cam')}
                    </div>
                    <span class="text-[11px] text-slate-400 block mt-0.5">Schede tecniche produttori e certificati ecologici per massimo punteggio tabellare.</span>
                  </div>
                </label>
                <button type="button" onclick="window.openBustaBCamModal()" class="mt-2.5 w-full px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer" title="Verifica certificazioni ambientali possedute per la fornitura">
                  <span>⚡ Verifica Criteri Ambientali Minimi (CAM)</span>
                </button>
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
              <span class="text-[10px] text-rose-400 font-mono">Zero elementi di prezzo</span>
            </div>

            <p class="text-[11px] text-slate-400 leading-relaxed">Nessun prezzo o percentuale economica deve apparire in questi allegati:</p>

            <div class="space-y-2.5">
              ${(s3.busta_b_files || []).map((file, idx) => `
                <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 shadow-inner">
                  <span class="font-mono text-purple-300 text-[11px] truncate select-all">${file}</span>
                  <button type="button" onclick="navigator.clipboard.writeText('${file}'); showNotification('Nome file copiato!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] shrink-0 border border-slate-700">Copia Nome</button>
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
              <span class="font-mono font-bold text-emerald-400 uppercase text-xs flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Calcolo Offerta Economica (Busta C)</span>
              </span>
              <span class="text-[10px] text-slate-500 font-mono">D.Lgs. 36/2023 art. 108</span>
            </div>

            <div class="grid grid-cols-2 gap-3.5">
              <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 shadow-inner">
                <label class="flex items-center text-slate-300 font-semibold mb-1">
                  <span>Base d'Asta (€):</span>
                  ${renderHelpBtn('busta_c_base')}
                </label>
                <input type="text" readonly value="${formatEUR(s3.busta_c_base_amount || tender.amount)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono text-xs">
              </div>

              <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 shadow-inner">
                <label class="flex items-center text-slate-300 font-semibold mb-1">
                  <span>Ribasso Offerto (%):</span>
                  ${renderHelpBtn('busta_c_discount')}
                </label>
                <input id="w_discount_pct" type="number" step="0.01" value="${s3.busta_c_discount_pct || 5.5}" oninput="window.recalcBustaCEconomics()" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold text-xs focus:border-cyan-400">
              </div>
            </div>

            <!-- Prezzo Netto Ricalcolato & Marginalita' -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 shadow-inner">
              <label class="flex items-center text-slate-300 font-semibold">
                <span>Prezzo Complessivo Netto Offerto:</span>
                ${renderHelpBtn('busta_c_price')}
              </label>
              <div class="flex gap-1.5">
                <input id="w_offered_price" type="text" readonly value="${formatEUR(s3.busta_c_offered_price)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-black text-sm">
                <button type="button" onclick="navigator.clipboard.writeText('${s3.busta_c_offered_price ? s3.busta_c_offered_price.toFixed(2) : '0'}'); showNotification('Cifra netta copiata!');" class="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs shrink-0 font-semibold border border-slate-700">Copia Cifra</button>
              </div>

              <!-- Indicatore Margine Residuo -->
              <div class="pt-2 flex items-center justify-between text-[11px] font-mono">
                <span class="text-slate-400">Margine residuo stimato:</span>
                <span id="labelEffectiveMargin" class="font-bold ${effectiveMargin !== null && effectiveMargin < 0 ? 'text-rose-400' : (effectiveMargin !== null && effectiveMargin < 8 ? 'text-amber-400' : 'text-emerald-400')}">
                  ${effectiveMargin !== null ? `${effectiveMargin}%` : 'N/D'} (Target: ${d.step2_data.margin_estimated_pct || 12.5}%)
                </span>
              </div>
            </div>

            <!-- ECCEZIONE FORNITURA SENZA POSA EX ART. 108 C.9 -->
            <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_fornitura_senza_posa" type="checkbox" ${s3.fornitura_senza_posa ? 'checked' : ''} onchange="window.toggleFornituraSenzaPosa(this.checked)" class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
                <div class="flex-1">
                  <div class="flex items-center">
                    <strong class="text-slate-200">Fornitura senza posa o servizio intellettuale</strong>
                    ${renderHelpBtn('fornitura_senza_posa')}
                  </div>
                  <span class="text-[11px] text-slate-400 block mt-0.5">Esente per legge (art. 108 c.9) dall'obbligo di scorporo di manodopera e sicurezza.</span>
                </div>
              </label>
            </div>

            <!-- Manodopera & Oneri Sicurezza ex art. 108 c. 9 -->
            <div id="boxManodoperaSicurezza" class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 shadow-inner ${s3.fornitura_senza_posa ? 'opacity-40 pointer-events-none' : ''}">
              <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <strong class="text-slate-200 font-mono text-xs">Scorporo Costi ex art. 108 c. 9 D.Lgs. 36/2023</strong>
                <span class="text-[10px] text-rose-400 font-mono">Obbligatorio a pena di esclusione</span>
              </div>

              <div class="grid grid-cols-2 gap-3.5">
                <div>
                  <label class="flex items-center text-slate-300 font-semibold mb-1">
                    <span>Costi Manodopera (€):</span>
                    ${renderHelpBtn('busta_c_manodopera')}
                  </label>
                  <input id="w_manodopera" type="number" value="${s3.busta_c_manodopera || 0}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs focus:border-cyan-400">
                </div>

                <div>
                  <label class="flex items-center text-slate-300 font-semibold mb-1">
                    <span>Oneri Sicurezza (€):</span>
                    ${renderHelpBtn('busta_c_sicurezza')}
                  </label>
                  <input id="w_sicurezza" type="number" value="${s3.busta_c_sicurezza || 0}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs focus:border-cyan-400">
                </div>
              </div>

              <button type="button" onclick="window.openManodoperaModal()" class="w-full px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer" title="Calcola automaticamente ore e tariffe CCNL per la manodopera">
                <span>⚡ Calcolatore Analitico Manodopera &amp; Sicurezza</span>
              </button>
            </div>

            <!-- Checkbox Obbligatoria per passaggio a Fase 4: Offerta inviata a sistema MePA -->
            <div class="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/40">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_offerta_inviata" type="checkbox" ${s3.offerta_inviata ? 'checked' : ''} class="rounded bg-slate-900 border-emerald-500 text-emerald-500 mt-0.5">
                <div class="flex-1">
                  <div class="flex items-center">
                    <strong class="text-emerald-300">Offerta Ufficialmente Inviata su AcquistinretePA</strong>
                    ${renderHelpBtn('offerta_inviata')}
                  </div>
                  <span class="text-[11px] text-slate-300 block mt-0.5">Conferma di aver completato e firmato le 3 buste sul portale MePA con rilascio di ricevuta.</span>
                </div>
              </label>
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
                <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 shadow-inner">
                  <span class="font-mono text-emerald-300 text-[11px] truncate select-all">${file}</span>
                  <button type="button" onclick="navigator.clipboard.writeText('${file}'); showNotification('Nome file copiato!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] shrink-0 border border-slate-700">Copia Nome</button>
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      ` : ''}

      <!-- CARD DOWNLOAD DOCUMENTI FASE 3 -->
      <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-purple-500/30 space-y-3 shadow-xl mt-4">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-xs">📥</span>
            <div>
              <h4 class="text-xs sm:text-sm font-bold text-white">Documenti Scaricabili &amp; Fascicolo Buste (Fase 3)</h4>
              <span class="text-[11px] text-slate-400 font-mono">Esporta domanda di partecipazione integrale, computo offerta economica e fascicolo tecnico</span>
            </div>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-purple-300 border border-slate-700">Fascicolo Completo</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 text-xs">
          <!-- 1. Istanza e Dichiarazione Integrativa Word/Doc -->
          <button type="button" onclick="window.downloadFase3Istanza('docx')" class="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition group cursor-pointer shadow-sm">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="font-bold text-slate-200 group-hover:text-cyan-300">📄 Domanda Partecipazione</span>
              <span class="font-mono text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">.DOCX</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-tight">Dichiarazione integrativa omnicomprensiva Buste A-B-C pronta per firma digitale .p7m.</p>
          </button>

          <!-- 2. Fascicolo Buste Markdown -->
          <button type="button" onclick="window.downloadFase3FascicoloMd()" class="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left transition group cursor-pointer shadow-sm">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="font-bold text-slate-200 group-hover:text-cyan-300">📝 Fascicolo Buste</span>
              <span class="font-mono text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">.MD</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-tight">Checklist tecnica e riepilogo documenti e file .p7m da caricare a portale MePA.</p>
          </button>

          <!-- 3. Computo Offerta Economica Excel CSV -->
          <button type="button" onclick="window.downloadFase3ComputoCsv()" class="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 text-left transition group cursor-pointer shadow-sm">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="font-bold text-slate-200 group-hover:text-emerald-300">📊 Computo Economico</span>
              <span class="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">.CSV</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-tight">Tabella offerta con scorporo analitico manodopera art. 108 c.9 e sicurezza per Excel.</p>
          </button>

          <!-- 4. Scheda Buste JSON -->
          <button type="button" onclick="window.downloadFase3Json()" class="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-left transition group cursor-pointer shadow-sm">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="font-bold text-slate-200 group-hover:text-purple-300">💾 Payload Buste</span>
              <span class="font-mono text-[10px] text-purple-400 font-bold bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/60">.JSON</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-tight">Dataset completo per caricamento automatico o handoff con agente Browser-Use.</p>
          </button>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // FASE 4: ESITO, AGGIUDICAZIONE & SVINCOLO POLIZZE
  // -------------------------------------------------------------
  if (currentWizardStep === 4) {
    const s4 = d.step4_data || {};
    const outcomeVal = s4.outcome || "In Valutazione";
    const isVinta = outcomeVal === "Vinta";
    const isPersa = outcomeVal === "Persa";

    return `
      <!-- BANNER GUIDA DELLA FASE 4 -->
      <div class="bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between border-b border-emerald-500/20 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-md shadow-emerald-500/30">4</span>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>🎯 Cosa devi fare in questa Fase 4: Esito, Aggiudicazione &amp; Svincolo Polizze</span>
              </h3>
              <span class="text-[11px] text-emerald-300 font-mono">Post-Gara &bull; Gestione Graduatoria &amp; Richiesta Liberatoria Fideiussione</span>
            </div>
          </div>
          <button onclick="window.showWizardHelpModal('fase4_svincolo')" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-mono inline-flex items-center gap-1.5 border border-slate-700 shadow-sm transition">
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
            <p class="text-slate-300 leading-relaxed">Se la gara e' conclusa (o persa), invia subito la PEC al RUP per farti rilasciare la liberatoria da trasmettere alla tua assicurazione per ripristinare il castelletto.</p>
          </div>
        </div>
      </div>

      <!-- WORKSPACE FASE 4 -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        
        <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
          <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
            <span class="font-mono font-bold text-emerald-400 uppercase text-xs flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Registrazione Esito Gara</span>
            </span>
            <span class="text-[10px] text-slate-500 font-mono">Verbale di Gara</span>
          </div>

          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 shadow-inner">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Stato Aggiudicazione Ufficiale:</span>
              ${renderHelpBtn('fase4_outcome')}
            </label>
            <select id="w_outcome" onchange="window.handleOutcomeChange(this.value)" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 font-bold text-xs focus:border-cyan-400 cursor-pointer">
              <option value="Vinta" ${outcomeVal === 'Vinta' ? 'selected' : ''}>🏆 Gara Vinta (Aggiudicazione Definitiva)</option>
              <option value="Persa" ${outcomeVal === 'Persa' ? 'selected' : ''}>❌ Gara Non Aggiudicata (Secondi classificati o scartati)</option>
              <option value="In Valutazione" ${outcomeVal === 'In Valutazione' ? 'selected' : ''}>⏳ In Valutazione (In attesa di seduta pubblica o anomalia)</option>
            </select>
          </div>

          <!-- BANNER ADATTIVO VINTA VS PERSA -->
          ${isVinta ? `
            <div class="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 space-y-2 shadow-inner">
              <div class="flex items-center gap-2 font-bold text-emerald-300">
                <span class="text-base">🏆</span>
                <span>Gara Aggiudicata: Adempimenti Contrattuali (art. 117)</span>
              </div>
              <p class="text-[11px] leading-relaxed">
                Predisporre la <strong>Garanzia Definitiva</strong> pari al 10% dell'importo contrattuale netto aggiudicato prima della stipula su MePA. La cauzione provvisoria viene automaticamente svincolata con la consegna della definitiva.
              </p>
            </div>
          ` : (isPersa ? `
            <div class="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 text-amber-200 space-y-2 shadow-inner">
              <div class="flex items-center gap-2 font-bold text-amber-300">
                <span class="text-base">ℹ️</span>
                <span>Procedura Conclusa: Recupero Castelletto Fideiussorio</span>
              </div>
              <p class="text-[11px] leading-relaxed">
                Richiedi immediatamente al RUP lo svincolo formale della cauzione provvisoria ex art. 106 c.11 per liberare il massimale presso il tuo broker o compagnia assicurativa.
              </p>
            </div>
          ` : `
            <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-400 text-[11px]">
              Gara in fase di esame delle offerte o verifica delle anomalie da parte del seggio di gara.
            </div>
          `)}

          <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner">
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
            <button type="button" onclick="window.openSvincoloFacsimileModal()" class="mt-2.5 w-full px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-semibold border border-cyan-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer" title="Genera testo PEC formale per richiesta liberatoria fideiussione al RUP">
              <span>🏛️ Genera Istanza Svincolo Provvisoria (PEC)</span>
            </button>
          </div>
        </div>

        <div class="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
          <div class="border-b border-slate-800 pb-2.5 flex items-center justify-between">
            <span class="font-mono font-bold text-slate-300 uppercase text-xs flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-slate-400"></span>
              <span>Verbale &amp; Dati Concorrenti</span>
            </span>
            <span class="text-[10px] text-slate-500 font-mono">Archivio Storico</span>
          </div>

          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 shadow-inner">
            <label class="flex items-center text-slate-300 font-semibold">
              <span>Note sull'Aggiudicazione &amp; Classifica:</span>
              ${renderHelpBtn('fase4_notes')}
            </label>
            <textarea id="w_step4_notes" rows="6" placeholder="Nome dell'aggiudicatario, ribasso vincente, graduatoria, distacco punteggi..." class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400 leading-relaxed">${escapeHtml(s4.note_conclusive || '')}</textarea>
            <span class="text-[10px] text-slate-500 font-mono">Questi dati concorrono all'analisi delle serie storiche e ai benchmark futuri</span>
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
    const senzaPosaEl = document.getElementById("w_fornitura_senza_posa");
    const offInvEl = document.getElementById("w_offerta_inviata");
    const garRateEl = document.getElementById("w_garanzia_rate");
    const garPmiEl = document.getElementById("w_garanzia_pmi");
    const garDigEl = document.getElementById("w_garanzia_digitale");

    if (dgueCheck) d.step3_data.busta_a_dgue_ready = dgueCheck.checked;
    if (fidCheck) d.step3_data.busta_a_fideiussione_ready = fidCheck.checked;
    if (fvoeEl) d.step3_data.busta_a_fvoe_passoe = fvoeEl.value.trim();
    if (bReady) d.step3_data.busta_b_ready = bReady.checked;
    if (bCam) d.step3_data.busta_b_criteri_cam = bCam.checked;
    if (senzaPosaEl) d.step3_data.fornitura_senza_posa = senzaPosaEl.checked;
    if (offInvEl) d.step3_data.offerta_inviata = offInvEl.checked;
    if (garRateEl) d.step3_data.garanzia_rate_pct = parseFloat(garRateEl.value) || 2.0;
    if (garPmiEl) d.step3_data.garanzia_pmi = garPmiEl.checked;
    if (garDigEl) d.step3_data.garanzia_riduzione_extra_pct = garDigEl.checked ? 10 : 0;

    if (discEl) {
      const pct = parseFloat(discEl.value) || 0;
      d.step3_data.busta_c_discount_pct = pct;
      const base = d.step3_data.busta_c_base_amount || 0;
      if (typeof WizardRules !== "undefined") {
        const ec = WizardRules.computeEconomics({ base, discountPct: pct });
        d.step3_data.busta_c_offered_price = ec.offered;
      } else {
        d.step3_data.busta_c_offered_price = base * (1 - (pct / 100));
      }
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
 * Auto-imposta il termine Q&A a 10 giorni prima della scadenza offerta
 */
window.autoSuggestQaDeadline = function() {
  const deadEl = document.getElementById("w_deadline");
  const qaEl = document.getElementById("w_qa_deadline");
  if (!deadEl || !qaEl) return;
  const deadlineVal = deadEl.value;
  if (!deadlineVal) {
    showNotification("Imposta prima la scadenza presentazione offerta.", false);
    return;
  }
  if (typeof WizardRules !== "undefined") {
    const suggested = WizardRules.defaultQaDeadline(deadlineVal, 10);
    qaEl.value = suggested;
    currentWizardData.step1_data.qa_deadline = suggested;
    showNotification("Termine Chiarimenti impostato a -10 giorni: " + suggested);
  }
};

/**
 * Gestisce il cambio di delibera Go / No-Go
 */
window.handleGoDecisionChange = function(decision) {
  readInputsFromWizardDOM();
  currentWizardData.step2_data.go_decision = decision;
  if (decision === "NO_GO") {
    showNotification("Hai impostato NO-GO: la gara verra' scartata e l'accesso alle buste sara' bloccato.", false);
  }
};

/**
 * Gestisce il cambio esito nella Fase 4
 */
window.handleOutcomeChange = function(outcome) {
  readInputsFromWizardDOM();
  currentWizardData.step4_data.outcome = outcome;
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId);
  if (tender) {
    tender.status = outcome;
  }
};

/**
 * Toggle per fornitura senza posa in opera (esente manodopera)
 */
window.toggleFornituraSenzaPosa = function(checked) {
  currentWizardData.step3_data.fornitura_senza_posa = checked;
  const box = document.getElementById("boxManodoperaSicurezza");
  if (box) {
    if (checked) {
      box.classList.add("opacity-40", "pointer-events-none");
    } else {
      box.classList.remove("opacity-40", "pointer-events-none");
    }
  }
};

/**
 * Ricalcola la cauzione provvisoria a partire dai controlli DOM
 */
window.recalcGuaranteeFromDOM = function() {
  const garRateEl = document.getElementById("w_garanzia_rate");
  const garPmiEl = document.getElementById("w_garanzia_pmi");
  const garDigEl = document.getElementById("w_garanzia_digitale");
  const labelEl = document.getElementById("labelGuaranteeAmount");

  const rate = garRateEl ? parseFloat(garRateEl.value) || 2.0 : 2.0;
  const pmi = garPmiEl ? garPmiEl.checked : true;
  const dig = garDigEl ? garDigEl.checked : false;

  currentWizardData.step3_data.garanzia_rate_pct = rate;
  currentWizardData.step3_data.garanzia_pmi = pmi;
  currentWizardData.step3_data.garanzia_riduzione_extra_pct = dig ? 10 : 0;

  const base = currentWizardData.step3_data.busta_c_base_amount || 0;
  if (typeof WizardRules !== "undefined") {
    const g = WizardRules.computeGuarantee({
      base,
      ratePct: rate,
      iso9001: !!currentWizardData.step2_data.check_iso,
      pmi,
      extraReductionPct: dig ? 10 : 0
    });
    currentWizardData.step3_data.busta_a_fideiussione_importo = g.amount;
    if (labelEl) labelEl.textContent = formatEUR(g.amount);
  }
};

/**
 * Ricalcola dinamicamente l'offerta economica in Busta C al variare del ribasso %
 */
window.recalcBustaCEconomics = function() {
  const discEl = document.getElementById("w_discount_pct");
  const offeredPriceEl = document.getElementById("w_offered_price");
  const labelMarginEl = document.getElementById("labelEffectiveMargin");
  if (!discEl || !offeredPriceEl) return;

  const pct = parseFloat(discEl.value) || 0;
  const base = currentWizardData.step3_data.busta_c_base_amount || 0;
  
  if (typeof WizardRules !== "undefined") {
    const ec = WizardRules.computeEconomics({ base, discountPct: pct });
    offeredPriceEl.value = formatEUR(ec.offered);
    currentWizardData.step3_data.busta_c_discount_pct = pct;
    currentWizardData.step3_data.busta_c_offered_price = ec.offered;

    const eff = WizardRules.marginAtDiscount(currentWizardData.step2_data.margin_estimated_pct || 12.5, pct);
    if (labelMarginEl && eff !== null) {
      labelMarginEl.textContent = `${eff}% (Target: ${currentWizardData.step2_data.margin_estimated_pct || 12.5}%)`;
      labelMarginEl.className = `font-bold ${eff < 0 ? 'text-rose-400' : (eff < 8 ? 'text-amber-400' : 'text-emerald-400')}`;
    }
  } else {
    const offered = base * (1 - (pct / 100));
    offeredPriceEl.value = formatEUR(offered);
    currentWizardData.step3_data.busta_c_discount_pct = pct;
    currentWizardData.step3_data.busta_c_offered_price = offered;
  }
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
 * Sposta il Wizard allo step specificato con controllo di gating deterministico
 */
window.setWizardStep = function(stepNum) {
  readInputsFromWizardDOM();

  // Controllo di Gating tramite WizardRules
  if (typeof WizardRules !== "undefined" && stepNum > currentWizardStep) {
    const canEnter = WizardRules.canEnterStep(stepNum, currentWizardData);
    if (!canEnter.ok) {
      window.showStepBlockedModal(stepNum, canEnter.errors);
      return;
    }
  }

  currentWizardStep = stepNum;
  currentWizardData.current_step = stepNum;
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  renderWizardView(tender);
};

/**
 * Salva e avanza allo step successivo con validazione e salvataggio
 */
window.advanceStepAndSave = async function() {
  readInputsFromWizardDOM();

  if (currentWizardStep < 4) {
    const nextStep = currentWizardStep + 1;
    if (typeof WizardRules !== "undefined") {
      const canEnter = WizardRules.canEnterStep(nextStep, currentWizardData);
      if (!canEnter.ok) {
        window.showStepBlockedModal(nextStep, canEnter.errors);
        return;
      }
    }
    currentWizardStep = nextStep;
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
    textToCopy = `=== DATI BANDO CONSIP MEPA ===\nCIG: ${d.step1_data.cig}\nEnte: ${d.step1_data.authority}\nOggetto: ${d.step1_data.title}\nScadenza Domande (Q&A): ${d.step1_data.qa_deadline}\nScadenza Presentazione: ${d.step1_data.deadline}\nRUP: ${d.step1_data.rup_name || 'N/D'}`;
  } else if (currentWizardStep === 2) {
    textToCopy = `=== QUALIFICAZIONE GO / NO-GO ===\nEsito: ${d.step2_data.go_decision}\nFatturato Specifico OK: ${d.step2_data.check_fatturato ? 'SI' : 'NO'}\nCertificazioni ISO 9001: ${d.step2_data.check_iso ? 'SI (-30% garanzia)' : 'NO'}\nSopralluogo: ${d.step2_data.check_sopralluogo ? 'EFFETTUATO' : 'NON PREVISTO/NO'}\nFideiussione Capiente: ${d.step2_data.check_garanzie ? 'SI' : 'NO'}\nMargine Stimato Target: ${d.step2_data.margin_estimated_pct}%\nNote Strategiche: ${d.step2_data.notes || '-'}`;
  } else if (currentWizardStep === 3) {
    textToCopy = `=== DATI LE 3 BUSTE TELEMATICHE ===\nCIG: ${d.step1_data.cig}\nFascicolo FVOE 2.0 ANAC: ${d.step3_data.busta_a_fvoe_passoe || 'N/D'}\nGaranzia Provvisoria Ridotta (€): ${d.step3_data.busta_a_fideiussione_importo}\nBase d'Asta (€): ${d.step3_data.busta_c_base_amount}\nRibasso Percentuale Offerto: ${d.step3_data.busta_c_discount_pct}%\nPrezzo Complessivo Netto (€): ${d.step3_data.busta_c_offered_price ? d.step3_data.busta_c_offered_price.toFixed(2) : '0'}\nEsente Manodopera: ${d.step3_data.fornitura_senza_posa ? 'SI (Fornitura senza posa / Servizio intellettuale art. 108 c.9)' : 'NO'}\nCosti Manodopera (€): ${d.step3_data.fornitura_senza_posa ? 'ESENTE' : d.step3_data.busta_c_manodopera}\nOneri Sicurezza (€): ${d.step3_data.fornitura_senza_posa ? 'ESENTE' : d.step3_data.busta_c_sicurezza}\nOfferta Inviata a Sistema: ${d.step3_data.offerta_inviata ? 'SI' : 'NO'}`;
  } else if (currentWizardStep === 4) {
    textToCopy = `=== ESITO GARA & SVINCOLO ===\nCIG: ${d.step1_data.cig}\nEsito Ufficiale: ${d.step4_data.outcome}\nFideiussione Svincolata (PEC RUP): ${d.step4_data.fideiussione_svincolata ? 'SI' : 'NO'}\nNote & Verbale: ${d.step4_data.note_conclusive || '-'}`;
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

  const payload = typeof WizardRules !== "undefined"
    ? WizardRules.buildAgentPayload(d)
    : {
        contract_type: "mepa_consip_tender_payload",
        version: "1.0",
        generated_at: new Date().toISOString(),
        tender: d.step1_data,
        qualification: d.step2_data,
        busta_a: d.step3_data,
        busta_b: d.step3_data,
        busta_c: d.step3_data
      };

  const jsonStr = JSON.stringify(payload, null, 2);

  let modal = document.getElementById("agentExportModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "agentExportModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const isReady = payload.readiness ? payload.readiness.ready_to_submit : true;

  modal.innerHTML = `
    <div class="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-sm">🤖</span>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-bold text-white">Payload per Agente Autonomo (Browser-Use)</h3>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full ${isReady ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">
                ${isReady ? '✓ PRONTO PER INVIO' : '⚠️ DATI INCOMPLETI'}
              </span>
            </div>
            <p class="text-[11px] text-slate-400 font-mono">Formato JSON v1.1 conforme con checklist operative e audit trail</p>
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
          <button onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(jsonStr)}')); showNotification('JSON copiato negli appunti!');" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition cursor-pointer">
            Copia JSON
          </button>
          <a download="payload_mepa_${d.step1_data.cig || 'gara'}.json" href="data:application/json;charset=utf-8,${encodeURIComponent(jsonStr)}" class="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer">
            Scarica .json
          </a>
        </div>
      </div>
    </div>
  `;
  modal.classList.remove("hidden");
};

/**
 * Renderizza l'elenco HTML delle note associate alla gara
 */
function renderGaraNotesListHtml(notes) {
  if (!notes || notes.length === 0) {
    return `
      <div class="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center text-slate-500 text-xs font-mono">
        Nessuna annotazione presente. Usa il form sopra per registrare decisioni, chiarimenti o verbali.
      </div>
    `;
  }

  const categoryBadges = {
    "GENERALE": "bg-slate-800 text-slate-300 border-slate-700",
    "Q&A": "bg-amber-500/10 text-amber-300 border-amber-500/30",
    "GO_NOGO": "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    "BUSTE": "bg-purple-500/10 text-purple-300 border-purple-500/30",
    "ESITO": "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
  };

  return notes.map(n => `
    <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-3 hover:border-slate-700 transition">
      <div class="space-y-1 min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[10px] font-mono px-2 py-0.5 rounded-md border ${categoryBadges[n.category] || categoryBadges['GENERALE']} font-bold">
            ${escapeHtml(n.category || 'GENERALE')}
          </span>
          <span class="text-[11px] font-mono text-slate-400">${escapeHtml(n.author || 'Operatore')}</span>
          <span class="text-[10px] font-mono text-slate-500">&bull; ${(n.created_at || '').substring(0, 16).replace('T', ' ')}</span>
        </div>
        <p class="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">${escapeHtml(n.content)}</p>
      </div>
      <button type="button" onclick="window.deleteGaraNote(${n.id})" class="text-slate-500 hover:text-rose-400 p-1 rounded-lg hover:bg-slate-900 transition text-xs shrink-0 cursor-pointer" title="Elimina questa nota">✕</button>
    </div>
  `).join('');
}

/**
 * Inserisce una nuova nota nella gara corrente (memorizzata su SQLite 3)
 */
window.addNewGaraNote = async function(categoryParam = null, contentParam = null) {
  const catEl = document.getElementById("newNoteCategory");
  const textEl = document.getElementById("newNoteContent");

  const category = categoryParam || (catEl ? catEl.value : "GENERALE");
  const content = contentParam || (textEl ? textEl.value.trim() : "");

  if (!content) {
    showNotification("Inserisci il testo della nota prima di aggiungerla.", false);
    return;
  }

  const newNote = {
    gara_id: currentWizardGaraId,
    author: "Ufficio Gare",
    category,
    content,
    created_at: new Date().toISOString()
  };

  if (liveBackendConnected && typeof Api !== "undefined" && Api.addNote) {
    try {
      const res = await Api.addNote(newNote);
      if (res && res.id) newNote.id = res.id;
    } catch (e) {
      console.error("Errore salvataggio nota su SQLite:", e);
    }
  }

  if (!currentWizardData.notes) currentWizardData.notes = [];
  currentWizardData.notes.unshift(newNote);

  if (textEl && !contentParam) textEl.value = "";

  const container = document.getElementById("garaNotesListContainer");
  const badge = document.getElementById("notesCountBadge");
  if (container) container.innerHTML = renderGaraNotesListHtml(currentWizardData.notes);
  if (badge) badge.textContent = `${currentWizardData.notes.length} note`;

  showNotification("Nota registrata nel Diario di Bordo della gara!");
};

/**
 * Elimina una nota
 */
window.deleteGaraNote = async function(noteId) {
  if (liveBackendConnected && typeof Api !== "undefined" && Api.deleteNote && noteId) {
    try {
      await Api.deleteNote(noteId);
    } catch (e) {
      console.error("Errore cancellazione nota:", e);
    }
  }

  currentWizardData.notes = (currentWizardData.notes || []).filter(n => n.id !== noteId);
  const container = document.getElementById("garaNotesListContainer");
  const badge = document.getElementById("notesCountBadge");
  if (container) container.innerHTML = renderGaraNotesListHtml(currentWizardData.notes);
  if (badge) badge.textContent = `${currentWizardData.notes.length} note`;

  showNotification("Nota eliminata.");
};

/**
 * Esporta la scadenza della gara corrente in formato iCalendar (.ics)
 */
window.exportCurrentTenderIcs = function() {
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  if (!tender.deadline) {
    showNotification("Questa gara non ha una scadenza valorizzata.", false);
    return;
  }
  if (typeof LegalTemplates !== "undefined" && LegalTemplates.downloadIcsFile) {
    LegalTemplates.downloadIcsFile(tender, `scadenza_${tender.cig || tender.id}.ics`);
    showNotification("Evento iCalendar (.ics) scaricato!");
  } else if (typeof Api !== "undefined") {
    window.open(Api.getIcsExportUrl(tender.id), "_blank");
  }
};

/**
 * Helper per scaricare un testo generato come file .txt
 */
window.downloadTextFile = function(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Apre la modale per la redazione del fac-simile di richiesta chiarimenti (Q&A)
 */
window.openQaFacsimileModal = function() {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  const s1 = d.step1_data || {};

  let modal = document.getElementById("qaFacsimileModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "qaFacsimileModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const renderModalContent = (qText) => {
    const fullText = typeof LegalTemplates !== "undefined"
      ? LegalTemplates.generateQaRequestText({
          cig: s1.cig,
          authority: s1.authority,
          rup: s1.rup_name,
          title: s1.title,
          question: qText,
          deadline: s1.deadline,
          qa_deadline: s1.qa_deadline
        })
      : `QUESITO GARA CIG ${s1.cig}\n${qText}`;

    modal.innerHTML = `
      <div class="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold text-sm">📝</span>
            <div>
              <h3 class="text-sm font-bold text-white">Generatore Fac-Simile Chiarimenti Q&amp;A</h3>
              <p class="text-[11px] text-amber-300/80 font-mono">Conforme art. 92, comma 2, D.Lgs. 36/2023 (risposte PA almeno 6gg prima)</p>
            </div>
          </div>
          <button onclick="document.getElementById('qaFacsimileModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
        </div>

        <div class="space-y-1.5">
          <label class="text-[11px] font-mono text-slate-300 font-semibold block">Formula il quesito specifico da inoltrare al RUP:</label>
          <textarea id="inputQaQuestion" rows="3" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 text-xs focus:border-amber-400 leading-relaxed">${escapeHtml(qText)}</textarea>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1.5">
          <label class="text-[11px] font-mono text-slate-400 block">Anteprima Istanza Formale (pronta per invio MePA / PEC):</label>
          <pre id="previewQaText" class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-amber-200/90 font-mono text-[11px] select-all leading-relaxed whitespace-pre-wrap">${escapeHtml(fullText)}</pre>
        </div>

        <div class="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span class="text-slate-400 font-mono text-[11px]">CIG: ${escapeHtml(s1.cig || 'N/D')}</span>
          <div class="flex items-center gap-2">
            <button type="button" onclick="window.saveCurrentQaToDiary()" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-xs transition cursor-pointer">
              Salva nel Diario
            </button>
            <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('previewQaText').innerText); showNotification('Quesito copiato negli appunti!');" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition cursor-pointer">
              Copia Testo
            </button>
            <button type="button" onclick="window.downloadTextFile('richiesta_chiarimenti_${s1.cig || 'gara'}.txt', document.getElementById('previewQaText').innerText)" class="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer">
              Scarica .txt
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("inputQaQuestion")?.addEventListener("input", (e) => {
      const updated = typeof LegalTemplates !== "undefined"
        ? LegalTemplates.generateQaRequestText({
            cig: s1.cig,
            authority: s1.authority,
            rup: s1.rup_name,
            title: s1.title,
            question: e.target.value,
            deadline: s1.deadline,
            qa_deadline: s1.qa_deadline
          })
        : e.target.value;
      const prev = document.getElementById("previewQaText");
      if (prev) prev.textContent = updated;
    });
  };

  renderModalContent("Si richiede cortese chiarimento in merito all'applicazione della clausola...");
  modal.classList.remove("hidden");
};

/**
 * Salva il quesito formale nel Diario di Bordo
 */
window.saveCurrentQaToDiary = function() {
  const textEl = document.getElementById("previewQaText");
  if (!textEl) return;
  window.addNewGaraNote("Q&A", textEl.innerText);
  document.getElementById("qaFacsimileModal")?.classList.add("hidden");
};

/**
 * Apre la modale per la redazione del fac-simile per svincolo fideiussione provvisoria
 */
window.openSvincoloFacsimileModal = function() {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  const s1 = d.step1_data || {};
  const s3 = d.step3_data || {};
  const s4 = d.step4_data || {};

  let modal = document.getElementById("svincoloFacsimileModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "svincoloFacsimileModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  let policyNum = s4.policy_number || "POL-2026-FIDEIUSSIONE";
  let guarantorName = s4.guarantor_name || "Compagnia Assicuratrice / Banca";

  const renderModalContent = () => {
    const fullText = typeof LegalTemplates !== "undefined"
      ? LegalTemplates.generateGuaranteeReleaseRequestText({
          cig: s1.cig,
          authority: s1.authority,
          rup: s1.rup_name,
          title: s1.title,
          policyNumber: policyNum,
          guarantor: guarantorName,
          amount: s3.busta_a_fideiussione_importo || 0,
          outcome: s4.outcome || "conclusa"
        })
      : `RICHIESTA SVINCOLO CIG ${s1.cig}`;

    modal.innerHTML = `
      <div class="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-sm">🏛️</span>
            <div>
              <h3 class="text-sm font-bold text-white">Istanza Svincolo Cauzione Provvisoria PEC</h3>
              <p class="text-[11px] text-cyan-300 font-mono">Art. 106 c. 10 D.Lgs. 36/2023 (liberatoria per garante bancario/assicurativo)</p>
            </div>
          </div>
          <button onclick="document.getElementById('svincoloFacsimileModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label class="text-[11px] font-mono text-slate-400 block mb-1">Numero Polizza Fideiussoria:</label>
            <input id="inputPolicyNumber" type="text" value="${escapeHtml(policyNum)}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-cyan-300 font-mono text-xs focus:border-cyan-400">
          </div>
          <div>
            <label class="text-[11px] font-mono text-slate-400 block mb-1">Istituto Bancario / Compagnia Garante:</label>
            <input id="inputGuarantor" type="text" value="${escapeHtml(guarantorName)}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">
          </div>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1.5">
          <label class="text-[11px] font-mono text-slate-400 block">Testo PEC Conforme pronto per la trasmissione:</label>
          <pre id="previewSvincoloText" class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-cyan-200/90 font-mono text-[11px] select-all leading-relaxed whitespace-pre-wrap">${escapeHtml(fullText)}</pre>
        </div>

        <div class="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span class="text-slate-400 font-mono text-[11px]">CIG: ${escapeHtml(s1.cig || 'N/D')}</span>
          <div class="flex items-center gap-2">
            <button type="button" onclick="window.saveCurrentSvincoloToDiary()" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs transition cursor-pointer">
              Salva nel Diario
            </button>
            <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('previewSvincoloText').innerText); showNotification('Testo PEC copiato negli appunti!');" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition cursor-pointer">
              Copia per PEC
            </button>
            <button type="button" onclick="window.downloadTextFile('istanza_svincolo_fideiussione_${s1.cig || 'gara'}.txt', document.getElementById('previewSvincoloText').innerText)" class="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer">
              Scarica .txt
            </button>
          </div>
        </div>
      </div>
    `;

    const updatePreview = () => {
      policyNum = document.getElementById("inputPolicyNumber")?.value || "";
      guarantorName = document.getElementById("inputGuarantor")?.value || "";
      s4.policy_number = policyNum;
      s4.guarantor_name = guarantorName;
      const updated = typeof LegalTemplates !== "undefined"
        ? LegalTemplates.generateGuaranteeReleaseRequestText({
            cig: s1.cig,
            authority: s1.authority,
            rup: s1.rup_name,
            title: s1.title,
            policyNumber: policyNum,
            guarantor: guarantorName,
            amount: s3.busta_a_fideiussione_importo || 0,
            outcome: s4.outcome || "conclusa"
          })
        : "RICHIESTA SVINCOLO";
      const prev = document.getElementById("previewSvincoloText");
      if (prev) prev.textContent = updated;
    };

    document.getElementById("inputPolicyNumber")?.addEventListener("input", updatePreview);
    document.getElementById("inputGuarantor")?.addEventListener("input", updatePreview);
  };

  renderModalContent();
  modal.classList.remove("hidden");
};

/**
 * Salva l'istanza di svincolo nel Diario di Bordo
 */
window.saveCurrentSvincoloToDiary = function() {
  const textEl = document.getElementById("previewSvincoloText");
  if (!textEl) return;
  window.addNewGaraNote("ESITO", textEl.innerText);
  document.getElementById("svincoloFacsimileModal")?.classList.add("hidden");
};

/**
 * ==============================================================================
 * PIPELINE DETERMINISTICA 1: Verifica Requisito Fatturato (art. 100 D.Lgs. 36/2023)
 * ==============================================================================
 */
window.openFatturatoModal = function() {
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  const baseAmount = currentWizardData?.step3_data?.busta_c_base_amount || tender.amount || 100000;
  const multiplier = 2.0; // Art. 100 c.11: max il doppio del valore dell'appalto
  const requiredTotal = baseAmount * multiplier;

  let modal = document.getElementById("fatturatoModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "fatturatoModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const renderContent = () => {
    modal.innerHTML = `
      <div class="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-sm">📊</span>
            <div>
              <h3 class="text-sm font-bold text-white">Pipeline Verifica Fatturato Specifico (art. 100)</h3>
              <p class="text-[11px] text-cyan-300/80 font-mono">D.Lgs. 36/2023 art. 100 c.11 (Soglia max 2x Base d'Asta)</p>
            </div>
          </div>
          <button onclick="document.getElementById('fatturatoModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
        </div>

        <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1.5 text-xs">
          <div class="flex justify-between text-slate-300">
            <span>Base d'Asta Procedura:</span>
            <span class="font-mono font-bold text-slate-100">${formatEUR(baseAmount)}</span>
          </div>
          <div class="flex justify-between text-slate-300">
            <span>Soglia Richiesta Disciplinare (2x):</span>
            <span class="font-mono font-bold text-cyan-400">${formatEUR(requiredTotal)}</span>
          </div>
        </div>

        <div class="space-y-3 text-xs">
          <label class="block font-semibold text-slate-200">Inserisci i fatturati aziendali degli ultimi 3 esercizi:</label>
          <div class="grid grid-cols-3 gap-2.5">
            <div>
              <label class="block text-[11px] text-slate-400 mb-1 font-mono">Anno T-1 (€)</label>
              <input id="inputFat1" type="number" value="${Math.round(requiredTotal * 0.4)}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-cyan-400">
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1 font-mono">Anno T-2 (€)</label>
              <input id="inputFat2" type="number" value="${Math.round(requiredTotal * 0.38)}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-cyan-400">
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1 font-mono">Anno T-3 (€)</label>
              <input id="inputFat3" type="number" value="${Math.round(requiredTotal * 0.35)}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-cyan-400">
            </div>
          </div>
        </div>

        <div id="fatturatoOutcomeBox" class="p-3.5 rounded-2xl border text-xs space-y-1"></div>

        <div class="pt-3 border-t border-slate-800 flex justify-end gap-2 text-xs">
          <button type="button" onclick="document.getElementById('fatturatoModal').classList.add('hidden')" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer">
            Annulla
          </button>
          <button type="button" id="btnApplyFatturato" class="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition shadow-lg shadow-cyan-500/20 cursor-pointer">
            Applica &amp; Spunta Requisito
          </button>
        </div>
      </div>
    `;

    const recalc = () => {
      const f1 = parseFloat(document.getElementById("inputFat1")?.value) || 0;
      const f2 = parseFloat(document.getElementById("inputFat2")?.value) || 0;
      const f3 = parseFloat(document.getElementById("inputFat3")?.value) || 0;
      const total = f1 + f2 + f3;
      const diff = total - requiredTotal;
      const box = document.getElementById("fatturatoOutcomeBox");
      const btn = document.getElementById("btnApplyFatturato");

      if (box) {
        if (total >= requiredTotal) {
          box.className = "p-3.5 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 text-xs space-y-1.5";
          box.innerHTML = `
            <div class="flex items-center justify-between text-emerald-400 font-bold">
              <span>🟢 REQUISITO PIENAMENTE SODDISFATTO</span>
              <span class="font-mono">${formatEUR(total)} (Surplus: +${formatEUR(diff)})</span>
            </div>
            <p class="text-slate-300 text-[11px] leading-relaxed">L'azienda è autosufficiente per la partecipazione singola. Nessuna necessità di ricorso a RTI o Avvalimento.</p>
          `;
          if (btn) btn.textContent = "Applica: Requisito Conforme (Autosufficiente)";
        } else {
          box.className = "p-3.5 rounded-2xl border border-rose-500/40 bg-rose-950/20 text-xs space-y-1.5";
          box.innerHTML = `
            <div class="flex items-center justify-between text-rose-400 font-bold">
              <span>🔴 REQUISITO NON SUFFICIENTE IN FORMA SINGOLA</span>
              <span class="font-mono">${formatEUR(total)} (Deficit: ${formatEUR(Math.abs(diff))})</span>
            </div>
            <p class="text-slate-300 text-[11px] leading-relaxed">Raccomandazione Strategica: Partecipazione in Raggruppamento Temporaneo (RTI con mandante) oppure stipula contratto di Avvalimento di garanzia ex art. 104 D.Lgs. 36/2023.</p>
          `;
          if (btn) btn.textContent = "Applica con Nota Strategica RTI / Avvalimento";
        }
      }
    };

    document.getElementById("inputFat1")?.addEventListener("input", recalc);
    document.getElementById("inputFat2")?.addEventListener("input", recalc);
    document.getElementById("inputFat3")?.addEventListener("input", recalc);
    recalc();

    document.getElementById("btnApplyFatturato")?.addEventListener("click", () => {
      const f1 = parseFloat(document.getElementById("inputFat1")?.value) || 0;
      const f2 = parseFloat(document.getElementById("inputFat2")?.value) || 0;
      const f3 = parseFloat(document.getElementById("inputFat3")?.value) || 0;
      const total = f1 + f2 + f3;
      const isOk = total >= requiredTotal;

      const chk = document.getElementById("w_check_fatturato");
      if (chk) chk.checked = true;
      currentWizardData.step2_data.check_fatturato = true;

      const notesEl = document.getElementById("w_step2_notes");
      if (notesEl) {
        const noteText = isOk
          ? `[Verifica Fatturato] Triennio ${formatEUR(total)} vs Richiesto ${formatEUR(requiredTotal)}: CONFORME (Autosufficiente).`
          : `[Verifica Fatturato] Triennio ${formatEUR(total)} vs Richiesto ${formatEUR(requiredTotal)}: DEFICIT di ${formatEUR(Math.abs(total - requiredTotal))}. Prevista partecipazione con RTI o Avvalimento art. 104.`;
        notesEl.value = notesEl.value ? `${notesEl.value}\n${noteText}` : noteText;
        currentWizardData.step2_data.notes = notesEl.value;
      }

      document.getElementById("fatturatoModal").classList.add("hidden");
      showNotification("Requisito fatturato calcolato e applicato!");
    });
  };

  renderContent();
  modal.classList.remove("hidden");
};

/**
 * ==============================================================================
 * PIPELINE DETERMINISTICA 2: Certificazioni ISO & Taglio Cauzione (art. 106 c.8)
 * ==============================================================================
 */
window.openCertificazioniModal = function() {
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  const baseAmount = currentWizardData?.step3_data?.busta_c_base_amount || tender.amount || 100000;
  const standardProvvisoria = baseAmount * 0.02; // 2% base d'asta

  let modal = document.getElementById("certificazioniModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "certificazioniModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const renderContent = () => {
    modal.innerHTML = `
      <div class="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold text-sm">🏅</span>
            <div>
              <h3 class="text-sm font-bold text-white">Certificazioni di Qualita' &amp; Taglio Cauzione</h3>
              <p class="text-[11px] text-amber-300/80 font-mono">D.Lgs. 36/2023 art. 106 comma 8 (Abbattimento Garanzia Provvisoria)</p>
            </div>
          </div>
          <button onclick="document.getElementById('certificazioniModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
        </div>

        <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1.5 text-xs">
          <div class="flex justify-between text-slate-300">
            <span>Base d'Asta:</span>
            <span class="font-mono font-bold text-slate-100">${formatEUR(baseAmount)}</span>
          </div>
          <div class="flex justify-between text-slate-300">
            <span>Garanzia Provvisoria Standard (2%):</span>
            <span class="font-mono font-bold text-amber-400">${formatEUR(standardProvvisoria)}</span>
          </div>
        </div>

        <div class="space-y-2 text-xs">
          <label class="block font-semibold text-slate-200">Seleziona le certificazioni e requisiti posseduti:</label>
          <div class="space-y-2">
            <label class="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/50 transition">
              <div class="flex items-center gap-2">
                <input type="checkbox" id="chkIso9001" checked class="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0">
                <span class="text-slate-200 font-medium">ISO 9001:2015 (Sistema Gestione Qualità)</span>
              </div>
              <span class="font-mono text-emerald-400 font-bold">-30%</span>
            </label>
            <label class="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/50 transition">
              <div class="flex items-center gap-2">
                <input type="checkbox" id="chkPmi" class="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0">
                <span class="text-slate-200 font-medium">Micro, Piccola o Media Impresa (PMI)</span>
              </div>
              <span class="font-mono text-emerald-400 font-bold">-50%</span>
            </label>
            <label class="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/50 transition">
              <div class="flex items-center gap-2">
                <input type="checkbox" id="chkDigitalFide" checked class="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0">
                <span class="text-slate-200 font-medium">Fideiussione Digitale (Firma Digitale + Notifica)</span>
              </div>
              <span class="font-mono text-emerald-400 font-bold">-10% (cumulabile)</span>
            </label>
            <label class="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/50 transition">
              <div class="flex items-center gap-2">
                <input type="checkbox" id="chkParita" class="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0">
                <span class="text-slate-200 font-medium">Parità di Genere (UNI/PdR 125) o ISO 27001 ICT</span>
              </div>
              <span class="font-mono text-emerald-400 font-bold">-20%</span>
            </label>
          </div>
        </div>

        <div id="certOutcomeBox" class="p-3.5 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 text-xs space-y-1"></div>

        <div class="pt-3 border-t border-slate-800 flex justify-end gap-2 text-xs">
          <button type="button" onclick="document.getElementById('certificazioniModal').classList.add('hidden')" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer">
            Annulla
          </button>
          <button type="button" id="btnApplyCert" class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition shadow-lg shadow-amber-500/20 cursor-pointer">
            Applica al Fascicolo Busta A
          </button>
        </div>
      </div>
    `;

    const recalc = () => {
      const hasIso = document.getElementById("chkIso9001")?.checked || false;
      const hasPmi = document.getElementById("chkPmi")?.checked || false;
      const hasDigital = document.getElementById("chkDigitalFide")?.checked || false;
      const hasParita = document.getElementById("chkParita")?.checked || false;

      // Logica conforme WizardRules / Art. 106 c.8
      let baseReduction = 0;
      if (hasPmi) {
        baseReduction = 0.50;
      } else if (hasIso) {
        baseReduction = 0.30;
      } else if (hasParita) {
        baseReduction = 0.20;
      }

      let extraReduction = 0;
      if (hasDigital) extraReduction += 0.10;

      const totalReductionPct = Math.min(60, Math.round((baseReduction + extraReduction) * 100));
      const reducedAmount = standardProvvisoria * (1 - (totalReductionPct / 100));
      const savings = standardProvvisoria - reducedAmount;

      const box = document.getElementById("certOutcomeBox");
      if (box) {
        box.innerHTML = `
          <div class="flex items-center justify-between text-emerald-400 font-bold">
            <span>Garanzia Provvisoria Ricalcolata:</span>
            <span class="font-mono text-sm">${formatEUR(reducedAmount)}</span>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-300">
            <span>Sconto totale di legge applicato:</span>
            <span class="font-mono text-emerald-300 font-semibold">-${totalReductionPct}% (Risparmio: ${formatEUR(savings)})</span>
          </div>
        `;
      }
    };

    ["chkIso9001", "chkPmi", "chkDigitalFide", "chkParita"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", recalc);
    });
    recalc();

    document.getElementById("btnApplyCert")?.addEventListener("click", () => {
      const hasIso = document.getElementById("chkIso9001")?.checked || false;
      const hasPmi = document.getElementById("chkPmi")?.checked || false;
      const hasDigital = document.getElementById("chkDigitalFide")?.checked || false;

      let baseRed = hasPmi ? 0.50 : (hasIso ? 0.30 : 0);
      let extraRed = hasDigital ? 0.10 : 0;
      const totalRedPct = Math.min(60, Math.round((baseRed + extraRed) * 100));
      const reducedAmount = standardProvvisoria * (1 - (totalRedPct / 100));

      const chk = document.getElementById("w_check_iso");
      if (chk) chk.checked = hasIso || hasPmi;
      currentWizardData.step2_data.check_iso = hasIso || hasPmi;

      // Sincronizza importo provvisoria ridotta in Busta A (Fase 3)
      currentWizardData.step3_data.busta_a_fideiussione_importo = Math.round(reducedAmount * 100) / 100;

      document.getElementById("certificazioniModal").classList.add("hidden");
      showNotification(`Certificazioni confermate: Cauzione provvisoria ridotta a ${formatEUR(reducedAmount)} (-${totalRedPct}%)`);
    });
  };

  renderContent();
  modal.classList.remove("hidden");
};

/**
 * ==============================================================================
 * PIPELINE DETERMINISTICA 3: Business Case & Simulatore Margine di Commessa
 * ==============================================================================
 */
window.openMargineModal = function() {
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  const baseAmount = currentWizardData?.step3_data?.busta_c_base_amount || tender.amount || 100000;

  let modal = document.getElementById("margineModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "margineModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const renderContent = () => {
    // Valori iniziali stimati di costo
    const defaultFornitura = Math.round(baseAmount * 0.55);
    const defaultManodopera = Math.round(baseAmount * 0.20);
    const defaultSicurezza = Math.round(baseAmount * 0.02);
    const defaultGenerali = Math.round(baseAmount * 0.03);
    const defaultDiscount = currentWizardData?.step3_data?.busta_c_discount_pct || 8.0;

    modal.innerHTML = `
      <div class="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-sm">💹</span>
            <div>
              <h3 class="text-sm font-bold text-white">Business Case &amp; Simulatore Margine di Commessa</h3>
              <p class="text-[11px] text-emerald-300/80 font-mono">Calcolo deterministico redditività e soglia anomalia (art. 110 D.Lgs. 36/2023)</p>
            </div>
          </div>
          <button onclick="document.getElementById('margineModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <span class="text-slate-400 block text-[11px]">Base d'Asta Gara:</span>
            <span class="font-mono font-bold text-slate-100 text-sm">${formatEUR(baseAmount)}</span>
          </div>
          <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <span class="text-slate-400 block text-[11px]">Prezzo Netto Offerto:</span>
            <span id="displayOfferedPrice" class="font-mono font-bold text-cyan-400 text-sm">${formatEUR(baseAmount * (1 - defaultDiscount/100))}</span>
          </div>
        </div>

        <!-- Slider Ribasso Offerto -->
        <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
          <div class="flex items-center justify-between">
            <label class="font-semibold text-slate-200">Ipotesi Ribasso Percentuale di Gara:</label>
            <span id="sliderValueText" class="font-mono font-bold text-amber-400 text-sm">${defaultDiscount.toFixed(1)}%</span>
          </div>
          <input id="sliderDiscount" type="range" min="0" max="35" step="0.5" value="${defaultDiscount}" class="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500">
          <div class="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>0% (Base Piena)</span>
            <span>10% (Media Consip)</span>
            <span>20% (Aggressivo)</span>
            <span>35% (Soglia Critica)</span>
          </div>
        </div>

        <!-- Scomposizione Costi Industriali -->
        <div class="space-y-2 text-xs">
          <label class="block font-semibold text-slate-200">Scomposizione Costi Industriali di Esecuzione:</label>
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Costi Forniture / Hardware / Licenze (€):</label>
              <input id="costFornitura" type="number" value="${defaultFornitura}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-emerald-400">
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Costi Manodopera Stimati (€ art. 108 c.9):</label>
              <input id="costManodopera" type="number" value="${defaultManodopera}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-emerald-400">
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Oneri Sicurezza Aziendali (€ art. 108 c.9):</label>
              <input id="costSicurezza" type="number" value="${defaultSicurezza}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-emerald-400">
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">Spese Generali / Oneri Finanziari (€):</label>
              <input id="costGenerali" type="number" value="${defaultGenerali}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-emerald-400">
            </div>
          </div>
        </div>

        <!-- Card Sintesi Esito e Semaforo Margine -->
        <div id="margineOutcomeCard" class="p-4 rounded-2xl border text-xs space-y-1.5"></div>

        <div class="pt-3 border-t border-slate-800 flex justify-end gap-2 text-xs">
          <button type="button" onclick="document.getElementById('margineModal').classList.add('hidden')" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer">
            Chiudi
          </button>
          <button type="button" id="btnApplyMargine" class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition shadow-lg shadow-emerald-500/20 cursor-pointer">
            Applica al Wizard &amp; Delibera
          </button>
        </div>
      </div>
    `;

    const recalc = () => {
      const discountPct = parseFloat(document.getElementById("sliderDiscount")?.value) || 0;
      const fornitura = parseFloat(document.getElementById("costFornitura")?.value) || 0;
      const manodopera = parseFloat(document.getElementById("costManodopera")?.value) || 0;
      const sicurezza = parseFloat(document.getElementById("costSicurezza")?.value) || 0;
      const generali = parseFloat(document.getElementById("costGenerali")?.value) || 0;

      const offeredPrice = baseAmount * (1 - discountPct / 100);
      const totalCosts = fornitura + manodopera + sicurezza + generali;
      const netMarginEuro = offeredPrice - totalCosts;
      const netMarginPct = offeredPrice > 0 ? (netMarginEuro / offeredPrice) * 100 : 0;

      const sliderText = document.getElementById("sliderValueText");
      if (sliderText) sliderText.textContent = `${discountPct.toFixed(1)}%`;

      const priceDisp = document.getElementById("displayOfferedPrice");
      if (priceDisp) priceDisp.textContent = formatEUR(offeredPrice);

      const card = document.getElementById("margineOutcomeCard");
      const btn = document.getElementById("btnApplyMargine");

      if (card) {
        if (netMarginPct >= 8.0) {
          card.className = "p-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 text-xs space-y-1.5";
          card.innerHTML = `
            <div class="flex items-center justify-between text-emerald-400 font-bold">
              <span>🟢 COMMESSA PROFITTEVOLE — PROPOSTA: DELIBERA GO</span>
              <span class="font-mono text-sm">+${formatEUR(netMarginEuro)} (${netMarginPct.toFixed(1)}%)</span>
            </div>
            <div class="flex justify-between text-slate-300 text-[11px]">
              <span>Totale Costi Industriali: ${formatEUR(totalCosts)}</span>
              <span class="text-emerald-300 font-semibold">Marginalità congrua &ge; 8%</span>
            </div>
          `;
          if (btn) btn.textContent = `Applica Delibera 🟢 GO (Margine: ${netMarginPct.toFixed(1)}%)`;
        } else if (netMarginPct >= 0) {
          card.className = "p-4 rounded-2xl border border-amber-500/40 bg-amber-950/20 text-xs space-y-1.5";
          card.innerHTML = `
            <div class="flex items-center justify-between text-amber-400 font-bold">
              <span>🟡 MARGINE RISTRETTO — RISCHIO ANOMALIA ART. 110</span>
              <span class="font-mono text-sm">+${formatEUR(netMarginEuro)} (${netMarginPct.toFixed(1)}%)</span>
            </div>
            <div class="flex justify-between text-slate-300 text-[11px]">
              <span>Totale Costi: ${formatEUR(totalCosts)}</span>
              <span class="text-amber-300 font-semibold">Consigliata prudenza</span>
            </div>
          `;
          if (btn) btn.textContent = `Applica con Riserva (Margine: ${netMarginPct.toFixed(1)}%)`;
        } else {
          card.className = "p-4 rounded-2xl border border-rose-500/40 bg-rose-950/20 text-xs space-y-1.5";
          card.innerHTML = `
            <div class="flex items-center justify-between text-rose-400 font-bold">
              <span>🔴 COMMESSA IN PERDITA — PROPOSTA: DELIBERA NO-GO</span>
              <span class="font-mono text-sm">${formatEUR(netMarginEuro)} (${netMarginPct.toFixed(1)}%)</span>
            </div>
            <div class="flex justify-between text-slate-300 text-[11px]">
              <span>Totale Costi: ${formatEUR(totalCosts)}</span>
              <span class="text-rose-400 font-semibold">I costi superano l'offerta netta!</span>
            </div>
          `;
          if (btn) btn.textContent = `Applica Delibera 🔴 NO-GO (In Perdita)`;
        }
      }
    };

    document.getElementById("sliderDiscount")?.addEventListener("input", recalc);
    ["costFornitura", "costManodopera", "costSicurezza", "costGenerali"].forEach(id => {
      document.getElementById(id)?.addEventListener("input", recalc);
    });
    recalc();

    document.getElementById("btnApplyMargine")?.addEventListener("click", () => {
      const discountPct = parseFloat(document.getElementById("sliderDiscount")?.value) || 0;
      const fornitura = parseFloat(document.getElementById("costFornitura")?.value) || 0;
      const manodopera = parseFloat(document.getElementById("costManodopera")?.value) || 0;
      const sicurezza = parseFloat(document.getElementById("costSicurezza")?.value) || 0;
      const generali = parseFloat(document.getElementById("costGenerali")?.value) || 0;

      const offeredPrice = baseAmount * (1 - discountPct / 100);
      const totalCosts = fornitura + manodopera + sicurezza + generali;
      const netMarginEuro = offeredPrice - totalCosts;
      const netMarginPct = offeredPrice > 0 ? (netMarginEuro / offeredPrice) * 100 : 0;

      // 1. Aggiorna Fase 2
      const marginInput = document.getElementById("w_margin_pct");
      if (marginInput) marginInput.value = Math.max(0, netMarginPct.toFixed(1));
      currentWizardData.step2_data.margin_estimated_pct = parseFloat(netMarginPct.toFixed(1));

      const goSelect = document.getElementById("w_go_decision");
      if (goSelect) {
        if (netMarginPct >= 8.0) {
          goSelect.value = "GO";
          currentWizardData.step2_data.go_decision = "GO";
        } else if (netMarginPct >= 0) {
          goSelect.value = "GO";
          currentWizardData.step2_data.go_decision = "GO";
        } else {
          goSelect.value = "NO_GO";
          currentWizardData.step2_data.go_decision = "NO_GO";
        }
      }

      // 2. Sincronizza Busta C (Fase 3)
      currentWizardData.step3_data.busta_c_base_amount = baseAmount;
      currentWizardData.step3_data.busta_c_discount_pct = discountPct;
      currentWizardData.step3_data.busta_c_offered_price = Math.round(offeredPrice * 100) / 100;
      currentWizardData.step3_data.busta_c_manodopera = manodopera;
      currentWizardData.step3_data.busta_c_sicurezza = sicurezza;

      // 3. Annotazione automatica
      const notesEl = document.getElementById("w_step2_notes");
      if (notesEl) {
        const busCaseNote = `[Business Case] Base ${formatEUR(baseAmount)} | Ribasso ${discountPct.toFixed(1)}% | Offerta ${formatEUR(offeredPrice)} | Costi ${formatEUR(totalCosts)} | Margine Netto: ${formatEUR(netMarginEuro)} (${netMarginPct.toFixed(1)}%).`;
        notesEl.value = notesEl.value ? `${notesEl.value}\n${busCaseNote}` : busCaseNote;
        currentWizardData.step2_data.notes = notesEl.value;
      }

      document.getElementById("margineModal").classList.add("hidden");
      showNotification(`Margine commessa calcolato (${netMarginPct.toFixed(1)}%) e sincronizzato con Busta C!`);
    });
  };

  renderContent();
  modal.classList.remove("hidden");
};

/**
 * ==============================================================================
 * PIPELINE DETERMINISTICA 4: Guida & Gestione Sopralluogo (art. 92 D.Lgs. 36/2023)
 * ==============================================================================
 */
window.openSopralluogoModal = function() {
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  const s1 = currentWizardData?.step1_data || {};
  const rupName = s1.rup_name || "Al Responsabile Unico del Progetto";
  const authority = s1.authority || tender.authority || "Stazione Appaltante";
  const cig = s1.cig || tender.cig || "CIG-NON-DEFINITO";
  const title = s1.title || tender.title || "Fornitura / Servizio";

  let modal = document.getElementById("sopralluogoModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "sopralluogoModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const renderContent = () => {
    modal.innerHTML = `
      <div class="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-sm">📍</span>
            <div>
              <h3 class="text-sm font-bold text-white">Guida Sopralluogo &amp; Generatore Istanza RUP</h3>
              <p class="text-[11px] text-purple-300/80 font-mono">D.Lgs. 36/2023 art. 92 comma 1 (Ispezione luoghi a pena di esclusione)</p>
            </div>
          </div>
          <button onclick="document.getElementById('sopralluogoModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
        </div>

        <div class="bg-purple-950/30 p-3.5 rounded-2xl border border-purple-800/40 text-purple-200 text-xs space-y-1">
          <strong class="text-purple-300 font-mono text-[11px] uppercase flex items-center gap-1.5">
            <span>💡 In parole povere: cos'è il sopralluogo?</span>
          </strong>
          <p class="text-slate-200 font-medium leading-relaxed">
            Se la gara prevede installazione fisica, posa o lavori presso la sede della PA, l'ente può obbligarti a mandare un tecnico a vedere i locali prima di fare l'offerta. Il funzionario pubblico (RUP) rilascia un foglio firmato (Attestato di Sopralluogo). Se nel bando c'è scritto "obbligatorio a pena di esclusione" e non lo fai, vieni scartato senza possibilità di recupero. Se invece vendi solo software cloud o beni a catalogo, quasi sempre <strong>non è richiesto</strong>.
          </p>
        </div>

        <div class="space-y-3 text-xs">
          <label class="block font-semibold text-slate-200">Scegli la situazione della tua azienda per questa gara:</label>
          
          <div class="space-y-2.5">
            <!-- Caso 1: Non Richiesto -->
            <label class="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/40 cursor-pointer transition">
              <input type="radio" name="sopralluogoChoice" value="NOT_REQUIRED" checked class="mt-0.5 text-purple-500 bg-slate-900 border-slate-700 focus:ring-0">
              <div class="flex-1">
                <strong class="text-slate-100 block">Opzione 1: Il bando NON richiede sopralluogo (Esente)</strong>
                <span class="text-slate-400 text-[11px]">Tipico per forniture pure, licenze software, beni standard senza lavori di posa complessi.</span>
              </div>
            </label>

            <!-- Caso 2: Già Effettuato -->
            <label class="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/40 cursor-pointer transition">
              <input type="radio" name="sopralluogoChoice" value="DONE" class="mt-0.5 text-purple-500 bg-slate-900 border-slate-700 focus:ring-0">
              <div class="flex-1 space-y-2">
                <strong class="text-slate-100 block">Opzione 2: Sopralluogo già effettuato (Attestato in possesso)</strong>
                <span class="text-slate-400 text-[11px] block">Un tuo incaricato ha visitato i locali e hai l'attestato firmato dal RUP da inserire nella Busta A.</span>
                <div id="sopralluogoDoneInputs" class="grid grid-cols-2 gap-2 pt-1 hidden">
                  <div>
                    <label class="text-[10px] text-slate-400 block mb-0.5">Data effettuazione:</label>
                    <input id="inputSopralluogoDate" type="date" value="${new Date().toISOString().substring(0,10)}" class="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-slate-200 text-xs">
                  </div>
                  <div>
                    <label class="text-[10px] text-slate-400 block mb-0.5">Tecnico aziendale incaricato:</label>
                    <input id="inputSopralluogoTech" type="text" placeholder="Nome cognome tecnico..." class="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-slate-200 text-xs">
                  </div>
                </div>
              </div>
            </label>

            <!-- Caso 3: Da Richiedere / Genera PEC -->
            <label class="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/40 cursor-pointer transition">
              <input type="radio" name="sopralluogoChoice" value="REQUEST" class="mt-0.5 text-purple-500 bg-slate-900 border-slate-700 focus:ring-0">
              <div class="flex-1 space-y-1.5">
                <strong class="text-slate-100 block">Opzione 3: È obbligatorio e devo ancora farlo &rarr; Genera PEC appuntamento</strong>
                <span class="text-slate-400 text-[11px] block">Crea subito la richiesta formale per concordare data e ora del sopralluogo con il RUP della PA.</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Sezione Anteprima PEC Sopralluogo (se Opzione 3) -->
        <div id="sopralluogoPecBox" class="space-y-1.5 hidden text-xs">
          <label class="text-[11px] font-mono text-purple-300 block">Testo PEC formale per richiesta sopralluogo al RUP:</label>
          <pre id="sopralluogoPecText" class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-purple-200 font-mono text-[11px] max-h-36 overflow-y-auto select-all whitespace-pre-wrap leading-relaxed"></pre>
        </div>

        <div class="pt-3 border-t border-slate-800 flex justify-between items-center gap-2 text-xs">
          <button type="button" id="btnCopySopralluogoPec" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 font-mono text-xs hidden transition cursor-pointer">
            Copia PEC
          </button>
          <div class="flex gap-2 ml-auto">
            <button type="button" onclick="document.getElementById('sopralluogoModal').classList.add('hidden')" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer">
              Annulla
            </button>
            <button type="button" id="btnApplySopralluogo" class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition shadow-lg shadow-purple-500/20 cursor-pointer">
              Applica Scelta al Wizard
            </button>
          </div>
        </div>
      </div>
    `;

    const pecText = `Spett.le ${authority}
Alla c.a. del Responsabile Unico del Progetto: ${rupName}
Oggetto: Richiesta fissazione appuntamento per SOPRALLUOGO OBBLIGATORIO
Procedura di Gara CIG: ${cig} - ${title}

Il sottoscritto Legale Rappresentante dell'operatore economico partecipante alla procedura in oggetto, con la presente
CHIEDE
di concordare un appuntamento per l'effettuazione del sopralluogo obbligatorio previsto dagli atti di gara.
Si segnala che l'ispezione verrà eseguita dal nostro tecnico incaricato munito di delega e documento di riconoscimento.
In attesa di cortese e tempestivo riscontro, si porgono cordiali saluti.`;

    const radioGroup = modal.querySelectorAll('input[name="sopralluogoChoice"]');
    const doneInputs = document.getElementById("sopralluogoDoneInputs");
    const pecBox = document.getElementById("sopralluogoPecBox");
    const pecPre = document.getElementById("sopralluogoPecText");
    const copyBtn = document.getElementById("btnCopySopralluogoPec");

    if (pecPre) pecPre.textContent = pecText;

    const handleRadio = () => {
      const selected = modal.querySelector('input[name="sopralluogoChoice"]:checked')?.value;
      if (selected === "DONE") {
        if (doneInputs) doneInputs.classList.remove("hidden");
        if (pecBox) pecBox.classList.add("hidden");
        if (copyBtn) copyBtn.classList.add("hidden");
      } else if (selected === "REQUEST") {
        if (doneInputs) doneInputs.classList.add("hidden");
        if (pecBox) pecBox.classList.remove("hidden");
        if (copyBtn) copyBtn.classList.remove("hidden");
      } else {
        if (doneInputs) doneInputs.classList.add("hidden");
        if (pecBox) pecBox.classList.add("hidden");
        if (copyBtn) copyBtn.classList.add("hidden");
      }
    };

    radioGroup.forEach(r => r.addEventListener("change", handleRadio));

    copyBtn?.addEventListener("click", () => {
      navigator.clipboard.writeText(pecText);
      showNotification("PEC di richiesta sopralluogo copiata negli appunti!");
    });

    document.getElementById("btnApplySopralluogo")?.addEventListener("click", () => {
      const selected = modal.querySelector('input[name="sopralluogoChoice"]:checked')?.value;
      const chk = document.getElementById("w_check_sopralluogo");
      const notesEl = document.getElementById("w_step2_notes");

      let noteMsg = "";
      if (selected === "NOT_REQUIRED") {
        if (chk) chk.checked = true;
        currentWizardData.step2_data.check_sopralluogo = true;
        noteMsg = `[Sopralluogo] Verificato: Non prescritto dal disciplinare per la presente tipologia di fornitura.`;
      } else if (selected === "DONE") {
        if (chk) chk.checked = true;
        currentWizardData.step2_data.check_sopralluogo = true;
        const dVal = document.getElementById("inputSopralluogoDate")?.value || "";
        const tVal = document.getElementById("inputSopralluogoTech")?.value || "tecnico incaricato";
        noteMsg = `[Sopralluogo] Effettuato in data ${dVal} da ${tVal}. Attestato firmato dal RUP pronto per Busta A.`;
      } else if (selected === "REQUEST") {
        if (chk) chk.checked = false;
        currentWizardData.step2_data.check_sopralluogo = false;
        noteMsg = `[Sopralluogo] OBBLIGATORIO - Richiesta PEC inviata al RUP ${rupName}. In attesa di attestato prima di chiudere la Busta A.`;
        window.addNewGaraNote("CHIARIMENTI", `Inviata richiesta appuntamento sopralluogo al RUP per CIG ${cig}`);
      }

      if (notesEl && noteMsg) {
        notesEl.value = notesEl.value ? `${notesEl.value}\n${noteMsg}` : noteMsg;
        currentWizardData.step2_data.notes = notesEl.value;
      }

      document.getElementById("sopralluogoModal").classList.add("hidden");
      showNotification("Stato sopralluogo aggiornato con successo!");
    });
  };

  renderContent();
  modal.classList.remove("hidden");
};

/**
 * ==============================================================================
 * PIPELINE DETERMINISTICA 5: Verifica Capienza Fido / Castelletto Garanzie
 * ==============================================================================
 */
window.openGaranzieModal = function() {
  const tender = getAllTendersFromSQLite().find(t => t.id === currentWizardGaraId) || {};
  const s1 = currentWizardData?.step1_data || {};
  const s3 = currentWizardData?.step3_data || {};
  const baseAmount = s3.busta_c_base_amount || tender.amount || 100000;
  
  // Importo della garanzia provvisoria necessaria (di default 2%, o ridotta se calcolata)
  const neededGuarantee = s3.busta_a_fideiussione_importo || (baseAmount * 0.02 * (currentWizardData?.step2_data?.check_iso ? 0.7 : 1.0));

  let modal = document.getElementById("garanzieModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "garanzieModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const renderContent = () => {
    modal.innerHTML = `
      <div class="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-sm">🛡️</span>
            <div>
              <h3 class="text-sm font-bold text-white">Verifica Capienza Fido &amp; Castelletto Garanzie</h3>
              <p class="text-[11px] text-emerald-300/80 font-mono">D.Lgs. 36/2023 art. 106 (Cauzione Provvisoria e Impegno Definitiva)</p>
            </div>
          </div>
          <button onclick="document.getElementById('garanzieModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
        </div>

        <div class="bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-800/40 text-emerald-200 text-xs space-y-1">
          <strong class="text-emerald-300 font-mono text-[11px] uppercase flex items-center gap-1.5">
            <span>💡 In parole povere: cos'è il castelletto fideiussorio?</span>
          </strong>
          <p class="text-slate-200 font-medium leading-relaxed">
            È il massimale di credito che la tua assicurazione o banca ti concede per partecipare alle gare d'appalto. Serve a rilasciare alla PA una cauzione provvisoria: la garanzia che se vinci firmerai davvero il contratto. Funziona come il plafond della carta di credito: se per questa gara servono ad esempio <strong>${formatEUR(neededGuarantee)}</strong>, devi verificare che nel tuo plafond assicurativo ci sia ancora capienza libera.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <span class="text-slate-400 block text-[11px]">Base d'Asta Gara:</span>
            <span class="font-mono font-bold text-slate-100 text-sm">${formatEUR(baseAmount)}</span>
          </div>
          <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <span class="text-slate-400 block text-[11px]">Cauzione Provvisoria Richiesta:</span>
            <span class="font-mono font-bold text-emerald-400 text-sm">${formatEUR(neededGuarantee)}</span>
          </div>
        </div>

        <div class="space-y-3 text-xs">
          <label class="block font-semibold text-slate-200">Inserisci i parametri del tuo fido aziendale con l'agenzia / banca:</label>
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-[11px] text-slate-400 mb-1 font-mono">Plafond Totale Concesso (€):</label>
              <input id="inputPlafondTotal" type="number" value="50000" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-emerald-400">
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1 font-mono">Garanzie Impegnate su Altre Gare (€):</label>
              <input id="inputPlafondUsed" type="number" value="12000" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-emerald-400">
            </div>
          </div>
        </div>

        <!-- Box Esito Deterministico Capienza -->
        <div id="garanzieOutcomeBox" class="p-3.5 rounded-2xl border text-xs space-y-1.5"></div>

        <!-- Richiesta Rapida Emissione Polizza per il Broker -->
        <div class="space-y-1.5 text-xs">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-mono text-slate-300 font-semibold">Testo pronto per richiesta emissione polizza al Broker / Assicuratore:</label>
            <button type="button" id="btnCopyBrokerText" class="text-emerald-400 hover:text-emerald-300 font-mono text-[11px]">Copia Richiesta Broker</button>
          </div>
          <textarea id="textBrokerRequest" rows="3" readonly class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-300 font-mono text-[11px] leading-relaxed select-all"></textarea>
        </div>

        <div class="pt-3 border-t border-slate-800 flex justify-end gap-2 text-xs">
          <button type="button" onclick="document.getElementById('garanzieModal').classList.add('hidden')" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer">
            Chiudi
          </button>
          <button type="button" id="btnApplyGaranzie" class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition shadow-lg shadow-emerald-500/20 cursor-pointer">
            Conferma Capienza e Spunta
          </button>
        </div>
      </div>
    `;

    const brokerText = `Spett.le Agenzia / Broker Assicurativo,
Vi richiediamo con urgenza l'emissione di Polizza Fideiussoria Provvisoria per la partecipazione a gara pubblica:
- Ente Appaltante: ${s1.authority || tender.authority || 'PA Committente'}
- Oggetto Gara: ${s1.title || tender.title || 'Appalto Fornitura/Servizi'}
- CIG: ${s1.cig || tender.cig || 'CIG-GARA'}
- Importo Garantito: ${formatEUR(neededGuarantee)} (al netto delle riduzioni di legge ex art. 106 c.8)
- Clausola obbligatoria: impegno espresso del garante a rilasciare la garanzia definitiva in caso di aggiudicazione ex art. 106 c.5.
- Formato richiesto: Digitale con firma digitale conforme a standard ANAC.
Restiamo in attesa dell'invio del file PDF firmato digitalmente.`;

    const brokerArea = document.getElementById("textBrokerRequest");
    if (brokerArea) brokerArea.value = brokerText;

    document.getElementById("btnCopyBrokerText")?.addEventListener("click", () => {
      navigator.clipboard.writeText(brokerText);
      showNotification("Testo richiesta polizza broker copiato negli appunti!");
    });

    const recalc = () => {
      const total = parseFloat(document.getElementById("inputPlafondTotal")?.value) || 0;
      const used = parseFloat(document.getElementById("inputPlafondUsed")?.value) || 0;
      const available = total - used;
      const diff = available - neededGuarantee;

      const box = document.getElementById("garanzieOutcomeBox");
      const btn = document.getElementById("btnApplyGaranzie");

      if (box) {
        if (diff >= 0) {
          box.className = "p-3.5 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 text-xs space-y-1.5";
          box.innerHTML = `
            <div class="flex items-center justify-between text-emerald-400 font-bold">
              <span>🟢 CAPIENZA PLAFOND CONFERMATA (SEMAFORO VERDE)</span>
              <span class="font-mono">Plafond Residuo: ${formatEUR(available)}</span>
            </div>
            <p class="text-slate-300 text-[11px] leading-relaxed">
              Il plafond residuo (${formatEUR(available)}) è ampiamente sufficiente per coprire la cauzione di ${formatEUR(neededGuarantee)}. Margine libero residuo post-gara: <strong>+${formatEUR(diff)}</strong>.
            </p>
          `;
          if (btn) btn.textContent = "Conferma Capienza e Spunta Requisito";
        } else {
          box.className = "p-3.5 rounded-2xl border border-rose-500/40 bg-rose-950/20 text-xs space-y-1.5";
          box.innerHTML = `
            <div class="flex items-center justify-between text-rose-400 font-bold">
              <span>🔴 PLAFOND INSUFFICIENTE (RISCHIO BLOCCO POLIZZA)</span>
              <span class="font-mono">Deficit: ${formatEUR(Math.abs(diff))}</span>
            </div>
            <p class="text-slate-300 text-[11px] leading-relaxed">
              Il plafond residuo (${formatEUR(available)}) non copre la cauzione richiesta (${formatEUR(neededGuarantee)}). 
              Azione necessaria: richiedi un ampliamento del castelletto alla compagnia oppure svincola le cauzioni delle vecchie gare concluse usando il nostro generatore di PEC svincolo nella Fase 4!
            </p>
          `;
          if (btn) btn.textContent = "Applica con Allerta di Plafond";
        }
      }
    };

    document.getElementById("inputPlafondTotal")?.addEventListener("input", recalc);
    document.getElementById("inputPlafondUsed")?.addEventListener("input", recalc);
    recalc();

    document.getElementById("btnApplyGaranzie")?.addEventListener("click", () => {
      const total = parseFloat(document.getElementById("inputPlafondTotal")?.value) || 0;
      const used = parseFloat(document.getElementById("inputPlafondUsed")?.value) || 0;
      const available = total - used;
      const isOk = available >= neededGuarantee;

      const chk = document.getElementById("w_check_garanzie");
      if (chk) chk.checked = true;
      currentWizardData.step2_data.check_garanzie = true;

      const notesEl = document.getElementById("w_step2_notes");
      if (notesEl) {
        const garNote = isOk
          ? `[Castelletto Garanzie] Plafond libero ${formatEUR(available)} vs Cauzione ${formatEUR(neededGuarantee)}: CAPIENTE.`
          : `[Castelletto Garanzie] ATTENZIONE: Plafond residuo ${formatEUR(available)} insufficiente rispetto a cauzione ${formatEUR(neededGuarantee)}. Richiesto ampliamento al broker.`;
        notesEl.value = notesEl.value ? `${notesEl.value}\n${garNote}` : garNote;
        currentWizardData.step2_data.notes = notesEl.value;
      }

      document.getElementById("garanzieModal").classList.add("hidden");
      showNotification("Capienza castelletto garanzie verificata e memorizzata!");
    });
  };

  renderContent();
  modal.classList.remove("hidden");
};

/**
 * ==============================================================================
 * EXPORT & DOWNLOAD DOCUMENTI FASE 1 & FASE 2
 * ==============================================================================
 */

/**
 * Scarica la Scheda Bando (Fase 1) in formato Word (.doc / .docx) o Markdown (.md)
 */
window.downloadFase1Scheda = function(format = 'docx') {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  const s1 = d.step1_data || {};
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};
  
  const params = {
    cig: s1.cig || tender.cig || "GARA",
    title: s1.title || tender.title || "Procedura di Gara",
    authority: s1.authority || tender.authority || "Stazione Appaltante",
    rup: s1.rup_name || tender.rup || "Da nominare / Disciplinare",
    amount: tender.amount || 0,
    deadline: s1.deadline || tender.deadline,
    qa_deadline: s1.qa_deadline || null,
    link: tender.link || "https://www.acquistinretepa.it",
    notes: s1.notes || tender.notes || ""
  };

  const cigSafe = (params.cig || "gara").replace(/[^a-zA-Z0-9_-]/g, "_");

  if (format === 'md') {
    const mdContent = typeof LegalTemplates !== "undefined"
      ? LegalTemplates.generateFase1SchedaMd(params)
      : `# SCHEDA BANDO CIG ${params.cig}\nOggetto: ${params.title}\nEnte: ${params.authority}`;
    
    window.downloadTextFile(`scheda_bando_${cigSafe}.md`, mdContent);
    showNotification("Scheda Bando Markdown (.md) scaricata!");
  } else {
    const htmlContent = typeof LegalTemplates !== "undefined"
      ? LegalTemplates.generateFase1SchedaHtml(params)
      : `<html><body><h1>Scheda Bando ${params.cig}</h1><p>${params.title}</p></body></html>`;
    
    const blob = new Blob([htmlContent], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scheda_bando_${cigSafe}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotification("Scheda Bando Word (.doc) scaricata!");
  }
};

/**
 * Scarica il Verbale Delibera Go/No-Go (Fase 2) in formato Word (.doc / .docx) o Markdown (.md)
 */
window.downloadFase2Verbale = function(format = 'docx') {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  const s1 = d.step1_data || {};
  const s2 = d.step2_data || {};
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};

  const params = {
    cig: s1.cig || tender.cig || "GARA",
    title: s1.title || tender.title || "Procedura di Gara",
    authority: s1.authority || tender.authority || "Stazione Appaltante",
    rup: s1.rup_name || tender.rup || "N/D",
    amount: tender.amount || 0,
    deadline: s1.deadline || tender.deadline,
    go_decision: s2.go_decision || "GO",
    margin_estimated_pct: s2.margin_estimated_pct !== undefined ? s2.margin_estimated_pct : 12.5,
    check_fatturato: s2.check_fatturato,
    check_iso: s2.check_iso,
    check_sopralluogo: s2.check_sopralluogo,
    check_garanzie: s2.check_garanzie,
    notes: s2.notes || ""
  };

  const cigSafe = (params.cig || "gara").replace(/[^a-zA-Z0-9_-]/g, "_");

  if (format === 'md') {
    const mdContent = typeof LegalTemplates !== "undefined"
      ? LegalTemplates.generateFase2VerbaleMd(params)
      : `# VERBALE DELIBERA CIG ${params.cig}\nEsito: ${params.go_decision}`;
    
    window.downloadTextFile(`verbale_delibera_${cigSafe}.md`, mdContent);
    showNotification("Verbale Delibera Markdown (.md) scaricato!");
  } else {
    const htmlContent = typeof LegalTemplates !== "undefined"
      ? LegalTemplates.generateFase2VerbaleHtml(params)
      : `<html><body><h1>Verbale Delibera ${params.cig}</h1><p>Esito: ${params.go_decision}</p></body></html>`;

    const blob = new Blob([htmlContent], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `verbale_delibera_${cigSafe}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotification("Verbale Delibera Word (.doc) scaricato!");
  }
};

/**
 * Scarica il Business Case di Fase 2 in formato CSV compatibile Excel (BOM UTF-8, ';')
 */
window.downloadFase2BusinessCaseCsv = function() {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  const s1 = d.step1_data || {};
  const s2 = d.step2_data || {};
  const s3 = d.step3_data || {};
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};

  const params = {
    cig: s1.cig || tender.cig || "GARA",
    title: s1.title || tender.title || "Procedura di Gara",
    authority: s1.authority || tender.authority || "Stazione Appaltante",
    amount: tender.amount || 0,
    discount_pct: s3.busta_c_discount_pct || 5.5,
    manodopera: s3.busta_c_manodopera || 0,
    sicurezza: s3.busta_c_sicurezza || 0,
    margin_estimated_pct: s2.margin_estimated_pct !== undefined ? s2.margin_estimated_pct : 12.5,
    go_decision: s2.go_decision || "GO"
  };

  const cigSafe = (params.cig || "gara").replace(/[^a-zA-Z0-9_-]/g, "_");
  const csvContent = typeof LegalTemplates !== "undefined"
    ? LegalTemplates.generateFase2BusinessCaseCsv(params)
    : `\uFEFFCIG;${params.cig}\nBase;${params.amount}`;

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `business_case_${cigSafe}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showNotification("Business Case Excel (.csv) scaricato!");
};

/**
 * Scarica il fascicolo di qualificazione di Fase 2 in formato JSON
 */
window.downloadFase2Json = function() {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  const s1 = d.step1_data || {};
  const s2 = d.step2_data || {};
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};

  const params = {
    cig: s1.cig || tender.cig || "GARA",
    title: s1.title || tender.title || "Procedura di Gara",
    authority: s1.authority || tender.authority || "Stazione Appaltante",
    rup: s1.rup_name || tender.rup || "N/D",
    amount: tender.amount || 0,
    deadline: s1.deadline || tender.deadline,
    qa_deadline: s1.qa_deadline || null,
    check_fatturato: s2.check_fatturato,
    check_iso: s2.check_iso,
    check_sopralluogo: s2.check_sopralluogo,
    check_garanzie: s2.check_garanzie,
    margin_estimated_pct: s2.margin_estimated_pct !== undefined ? s2.margin_estimated_pct : 12.5,
    go_decision: s2.go_decision || "GO",
    notes: s2.notes || ""
  };

  const cigSafe = (params.cig || "gara").replace(/[^a-zA-Z0-9_-]/g, "_");
  const jsonObj = typeof LegalTemplates !== "undefined"
    ? LegalTemplates.generateFase2Json(params)
    : params;

  const jsonStr = JSON.stringify(jsonObj, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qualificazione_fase2_${cigSafe}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showNotification("Fascicolo Qualificazione JSON scaricato!");
};

/**
 * ==============================================================================
 * PIPELINE DETERMINISTICHE FASE 3 (BUSTA A, BUSTA B, BUSTA C)
 * ==============================================================================
 */

/**
 * 1. Pipeline Guidata DGUE Elettronico (ESPD)
 */
window.openDgueModal = function() {
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};
  const cig = currentWizardData?.step1_data?.cig || tender.cig || "GARA";

  let modal = document.getElementById("dgueModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "dgueModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-sm">📋</span>
          <div>
            <h3 class="text-sm font-bold text-white">Procedura Guidata DGUE Elettronico (ESPD)</h3>
            <p class="text-[11px] text-cyan-300/80 font-mono">D.Lgs. 36/2023 artt. 94-98 &bull; Dichiarazione Unica Europea</p>
          </div>
        </div>
        <button onclick="document.getElementById('dgueModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
      </div>

      <div class="bg-cyan-950/30 p-3.5 rounded-2xl border border-cyan-800/40 text-cyan-200 text-xs space-y-1">
        <strong>💡 In parole povere (se non sei del settore):</strong>
        <p class="text-slate-200 text-[11px] leading-relaxed">
          Il DGUE è il "passaporto" con cui attesti di avere i conti in ordine (DURC e tasse) e la fedina penale pulita.
          Spunta i controlli seguenti per confermare che l'azienda è abilitata a partecipare.
        </p>
      </div>

      <div class="space-y-2.5 text-xs">
        <div>
          <label class="block font-semibold text-slate-200 mb-1">Forma Giuridica di Partecipazione:</label>
          <select id="selDgueForma" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:border-cyan-400">
            <option value="singola">Impresa Singola (Operatore Economico Individuale o Societario)</option>
            <option value="mandataria">Capogruppo Mandataria di Raggruppamento Temporaneo (RTI Costituendo/Costituito)</option>
            <option value="mandante">Mandante di Raggruppamento Temporaneo (RTI)</option>
            <option value="consorziata">Consorziata Esecutrice designata da Consorzio</option>
          </select>
        </div>

        <div class="space-y-2 pt-2 border-t border-slate-800">
          <label class="block font-semibold text-slate-200">Autoverifica Motivi di Esclusione (artt. 94, 95 D.Lgs. 36/2023):</label>
          
          <label class="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
            <input type="checkbox" id="chkDgue1" checked class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
            <div class="text-[11px] text-slate-300">
              <strong>Assenza condanne penali e reati gravi (Art. 94):</strong> Nessuna condanna con sentenza passata in giudicato a carico degli amministratori per reati contro la PA, frode o riciclaggio.
            </div>
          </label>

          <label class="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
            <input type="checkbox" id="chkDgue2" checked class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
            <div class="text-[11px] text-slate-300">
              <strong>Regolarità Fiscale e Contributiva (Art. 95):</strong> DURC online in corso di validità e assenza di debiti tributari definitivamente accertati.
            </div>
          </label>

          <label class="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
            <input type="checkbox" id="chkDgue3" checked class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
            <div class="text-[11px] text-slate-300">
              <strong>Norme sul Lavoro dei Disabili & Sicurezza (L. 68/99, D.Lgs. 81/08):</strong> Piena osservanza delle norme sul diritto al lavoro dei disabili e adozione del DVR.
            </div>
          </label>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span class="text-slate-400 font-mono text-[11px]">CIG: ${escapeHtml(cig)}</span>
        <div class="flex items-center gap-2">
          <button type="button" onclick="document.getElementById('dgueModal').classList.add('hidden')" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
            Annulla
          </button>
          <button type="button" id="btnApplyDgue" class="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition">
            Conferma e Spunta DGUE Pronto
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btnApplyDgue")?.addEventListener("click", () => {
    const chk = document.getElementById("w_busta_a_dgue");
    if (chk) chk.checked = true;
    currentWizardData.step3_data.busta_a_dgue_ready = true;

    const forma = document.getElementById("selDgueForma")?.value || "singola";
    window.addNewGaraNote("BUSTE", `[DGUE ESPD] Verificato e validato per partecipazione in forma: ${forma.toUpperCase()}. Assenza motivi ostativi confermata.`);

    document.getElementById("dgueModal").classList.add("hidden");
    showNotification("DGUE verificato e registrato nel fascicolo Busta A!");
  });

  modal.classList.remove("hidden");
};

/**
 * 2. Pipeline Assistente Codice FVOE 2.0 ANAC
 */
window.openFvoeModal = function() {
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};
  const cig = currentWizardData?.step1_data?.cig || tender.cig || "GARA";

  let modal = document.getElementById("fvoeModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "fvoeModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const simulatedCode = `FVOE-${cig.slice(0, 4)}-${new Date().getFullYear()}`;

  modal.innerHTML = `
    <div class="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-sm">🏛️</span>
          <div>
            <h3 class="text-sm font-bold text-white">Assistente Fascicolo Virtuale FVOE 2.0 ANAC</h3>
            <p class="text-[11px] text-purple-300/80 font-mono">Banca Dati Nazionale Contratti Pubblici (BDNCP)</p>
          </div>
        </div>
        <button onclick="document.getElementById('fvoeModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
      </div>

      <div class="bg-purple-950/30 p-3.5 rounded-2xl border border-purple-800/40 text-purple-200 text-xs space-y-1">
        <strong>💡 Come ottenere il codice sul portale ANAC:</strong>
        <ol class="list-decimal list-inside text-slate-200 text-[11px] space-y-1 mt-1 leading-relaxed">
          <li>Accedi con SPID/CIE al portale ANAC dei Servizi per le Imprese.</li>
          <li>Apri il servizio <strong>FVOE 2.0</strong> e inserisci il CIG: <code class="text-cyan-300 font-mono font-bold">${escapeHtml(cig)}</code></li>
          <li>Genera l'autorizzazione all'accesso per la Stazione Appaltante e copia il codice rilasciato.</li>
        </ol>
      </div>

      <div class="space-y-2 text-xs">
        <label class="block font-semibold text-slate-200">Codice Identificativo Fascicolo FVOE:</label>
        <div class="flex gap-2">
          <input id="inputFvoeCode" type="text" value="${escapeHtml(currentWizardData?.step3_data?.busta_a_fvoe_passoe || simulatedCode)}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-cyan-300 font-mono text-xs focus:border-purple-400">
          <button type="button" onclick="navigator.clipboard.writeText('${escapeHtml(cig)}'); showNotification('CIG copiato negli appunti!');" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs shrink-0">
            Copia CIG
          </button>
        </div>
        <span class="text-[10px] text-slate-500 font-mono">Formato standard rilasciato da ANAC: FVOE-[ID]-ANNO</span>
      </div>

      <div class="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
        <a href="https://www.anticorruzione.it/-/fascicolo-virtuale-dell-operatore-economico-fvoe" target="_blank" rel="noopener noreferrer" class="text-purple-400 hover:underline flex items-center gap-1 font-mono text-[11px]">
          <span>Portale ANAC FVOE ↗</span>
        </a>
        <div class="flex items-center gap-2">
          <button type="button" onclick="document.getElementById('fvoeModal').classList.add('hidden')" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
            Chiudi
          </button>
          <button type="button" id="btnApplyFvoe" class="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition">
            Applica Codice al Wizard
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btnApplyFvoe")?.addEventListener("click", () => {
    const val = document.getElementById("inputFvoeCode")?.value.trim() || "";
    const el = document.getElementById("w_fvoe_code");
    if (el) el.value = val;
    currentWizardData.step3_data.busta_a_fvoe_passoe = val;

    window.addNewGaraNote("BUSTE", `[FVOE 2.0 ANAC] Codice fascicolo registrato: ${val}`);
    document.getElementById("fvoeModal").classList.add("hidden");
    showNotification("Codice FVOE 2.0 registrato con successo!");
  });

  modal.classList.remove("hidden");
};

/**
 * 3. Pipeline Richiesta Polizza Fideiussoria al Broker Assicurativo
 */
window.openBrokerGuaranteeModal = function() {
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};
  const s1 = currentWizardData?.step1_data || {};
  const s3 = currentWizardData?.step3_data || {};
  const tenderAmount = Number(s3.busta_c_base_amount || tender.amount) || 100000;
  
  const guaranteeCalc = typeof WizardRules !== "undefined"
    ? WizardRules.computeGuarantee({
        base: tenderAmount,
        ratePct: s3.garanzia_rate_pct || 2.0,
        iso9001: !!currentWizardData?.step2_data?.check_iso,
        pmi: !!s3.garanzia_pmi,
        extraReductionPct: s3.garanzia_riduzione_extra_pct || 0
      })
    : { amount: Math.round(tenderAmount * 0.01), gross: Math.round(tenderAmount * 0.02) };

  const cig = s1.cig || tender.cig || "GARA";
  const authority = s1.authority || tender.authority || "Stazione Appaltante";
  const title = s1.title || tender.title || "Procedura di Gara";

  let modal = document.getElementById("brokerGuaranteeModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "brokerGuaranteeModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const brokerMailText = `Spett.le Compagnia Assicuratrice / Broker Convenzionato,

Si richiede con cortese urgenza l'emissione di Polizza Fideiussoria per GARANZIA PROVVISORIA ex art. 106 D.Lgs. 36/2023 per la partecipazione alla seguente procedura MePA:

CIG ANAC: ${cig}
OGGETTO: ${title}
STAZIONE APPALTANTE: ${authority}
VALORE A BASE D'ASTA: ${formatEUR(tenderAmount)}

IMPORTO GARANTITO RICHIESTO: ${formatEUR(guaranteeCalc.amount)} (già al netto delle riduzioni di legge ex art. 106 c.8 per PMI e fideiussione digitale)
BENEFICIARIO: ${authority}

CLAUSOLE OBBLIGATORIE RICHIESTE DAL BANDO A PENA DI ESCLUSIONE:
1. Rinuncia al beneficio della preventiva escussione del debitore principale ex art. 1944 c.c.;
2. Rinuncia all'eccezione di cui all'art. 1957, comma 2, del codice civile;
3. Operatività della garanzia entro 15 (quindici) giorni a semplice richiesta scritta dell'Ente;
4. Impegno del garante a rilasciare la garanzia definitiva per l'esecuzione del contratto qualora l'impresa risulti aggiudicataria (art. 106 c.5 D.Lgs. 36/2023).

Si richiede la trasmissione del documento firmato digitalmente in formato CAdES (.pdf.p7m) per il caricamento sulla piattaforma AcquistinretePA.

In attesa di riscontro, cordiali saluti.`;

  modal.innerHTML = `
    <div class="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-sm">🛡️</span>
          <div>
            <h3 class="text-sm font-bold text-white">Richiesta Polizza Fideiussoria ex art. 106 (Broker / Banca)</h3>
            <p class="text-[11px] text-emerald-300/80 font-mono">Importo netto calcolato: ${formatEUR(guaranteeCalc.amount)}</p>
          </div>
        </div>
        <button onclick="document.getElementById('brokerGuaranteeModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar space-y-2">
        <label class="text-[11px] font-mono text-slate-300 font-semibold block">Testo formale email pronto per invio alla compagnia assicurativa:</label>
        <pre id="preBrokerMail" class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-emerald-300 font-mono text-[11px] select-all leading-relaxed whitespace-pre-wrap">${escapeHtml(brokerMailText)}</pre>
      </div>

      <div class="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('preBrokerMail').innerText); showNotification('Testo per broker copiato negli appunti!');" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition">
          Copia Testo Email
        </button>
        <div class="flex items-center gap-2">
          <button type="button" onclick="window.downloadTextFile('richiesta_fideiussione_${cig}.txt', document.getElementById('preBrokerMail').innerText)" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-mono text-xs transition">
            Scarica .txt
          </button>
          <button type="button" id="btnConfirmGuarantee" class="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition">
            Conferma Acquisizione e Spunta
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btnConfirmGuarantee")?.addEventListener("click", () => {
    const chk = document.getElementById("w_busta_a_fideiussione");
    if (chk) chk.checked = true;
    currentWizardData.step3_data.busta_a_fideiussione_ready = true;
    currentWizardData.step3_data.busta_a_fideiussione_importo = guaranteeCalc.amount;

    window.addNewGaraNote("BUSTE", `[Garanzia Provvisoria art. 106] Polizza confermata per importo ridotto ${formatEUR(guaranteeCalc.amount)}.`);
    document.getElementById("brokerGuaranteeModal").classList.add("hidden");
    showNotification("Garanzia provvisoria confermata e spuntata nel Wizard!");
  });

  modal.classList.remove("hidden");
};

/**
 * 4. Pipeline Checklist Anti-Esclusione Busta B Tecnica
 */
window.openBustaBCheckModal = function() {
  let modal = document.getElementById("bustaBModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "bustaBModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-sm">📐</span>
          <div>
            <h3 class="text-sm font-bold text-white">Checklist Anti-Esclusione Relazione Tecnica (Busta B)</h3>
            <p class="text-[11px] text-purple-300/80 font-mono">D.Lgs. 36/2023 &bull; Principio di Separazione Buste</p>
          </div>
        </div>
        <button onclick="document.getElementById('bustaBModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
      </div>

      <div class="p-3 rounded-2xl bg-rose-950/30 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
        <span class="text-lg">🚫</span>
        <span><strong>DIVIETO ASSOLUTO DI COMMISTIONE:</strong> Assicurati che nessun file della Busta Tecnica contenga prezzi o sconti, pena l'esclusione insanabile!</span>
      </div>

      <div class="space-y-2.5 text-xs">
        <label class="block font-semibold text-slate-200">Verifica di conformità pre-caricamento:</label>

        <label class="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
          <input type="checkbox" id="chkB1" checked class="rounded bg-slate-900 border-slate-700 text-purple-500 mt-0.5">
          <div class="text-[11px] text-slate-300">
            <strong>Rispetto Limite Massimo Pagine:</strong> La relazione descrittiva non eccede il tetto massimo di facciate stabilito dal disciplinare.
          </div>
        </label>

        <label class="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
          <input type="checkbox" id="chkB2" checked class="rounded bg-slate-900 border-slate-700 text-purple-500 mt-0.5">
          <div class="text-[11px] text-slate-300">
            <strong>Nessun Prezzo Citato:</strong> Nessuna cifra in euro, tariffa oraria o percentuale di ribasso è presente nella relazione tecnica.
          </div>
        </label>

        <label class="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
          <input type="checkbox" id="chkB3" checked class="rounded bg-slate-900 border-slate-700 text-purple-500 mt-0.5">
          <div class="text-[11px] text-slate-300">
            <strong>Firma Digitale CAdES (.p7m):</strong> Il file PDF finale è stato firmato digitalmente dal legale rappresentante o procuratore.
          </div>
        </label>
      </div>

      <div class="pt-3 border-t border-slate-800 flex justify-end gap-2 text-xs">
        <button type="button" onclick="document.getElementById('bustaBModal').classList.add('hidden')" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
          Annulla
        </button>
        <button type="button" id="btnApplyBustaB" class="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition">
          Conferma Relazione Tecnica e Spunta
        </button>
      </div>
    </div>
  `;

  document.getElementById("btnApplyBustaB")?.addEventListener("click", () => {
    const chk = document.getElementById("w_busta_b_ready");
    if (chk) chk.checked = true;
    currentWizardData.step3_data.busta_b_ready = true;

    window.addNewGaraNote("BUSTE", "[Busta B Tecnica] Checklist conformità completata: assenza elementi di prezzo e limite pagine verificato.");
    document.getElementById("bustaBModal").classList.add("hidden");
    showNotification("Relazione tecnica verificata e contrassegnata come pronta!");
  });

  modal.classList.remove("hidden");
};

/**
 * 5. Pipeline Criteri Ambientali Minimi (CAM) Busta B
 */
window.openBustaBCamModal = function() {
  let modal = document.getElementById("camModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "camModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-sm">🌱</span>
          <div>
            <h3 class="text-sm font-bold text-white">Assistente Criteri Ambientali Minimi (CAM - Art. 57)</h3>
            <p class="text-[11px] text-emerald-300/80 font-mono">Punteggio Tecnico Premiale &bull; Sostenibilità Ambientale</p>
          </div>
        </div>
        <button onclick="document.getElementById('camModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
      </div>

      <div class="bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-800/40 text-emerald-200 text-xs space-y-1">
        <strong>💡 A cosa servono i CAM:</strong>
        <p class="text-slate-200 text-[11px] leading-relaxed">
          I CAM premiano i prodotti ecologici. Seleziona le certificazioni disponibili dei produttori per richiedere l'attribuzione del punteggio tecnico tabellare.
        </p>
      </div>

      <div class="space-y-2 text-xs">
        <label class="block font-semibold text-slate-200">Certificazioni Green della Fornitura:</label>
        
        <label class="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer text-slate-300">
          <input type="checkbox" id="camCert1" checked class="rounded bg-slate-900 border-slate-700 text-emerald-500">
          <span>Ecolabel UE o Marchio Ecologico Equivalente (ISO 14024)</span>
        </label>

        <label class="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer text-slate-300">
          <input type="checkbox" id="camCert2" checked class="rounded bg-slate-900 border-slate-700 text-emerald-500">
          <span>Certificazione Efficienza Energetica (Energy Star / Classe A+)</span>
        </label>

        <label class="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer text-slate-300">
          <input type="checkbox" id="camCert3" checked class="rounded bg-slate-900 border-slate-700 text-emerald-500">
          <span>Imballaggi Riciclabili al 100% o Compostabili (Direttiva UE)</span>
        </label>
      </div>

      <div class="pt-3 border-t border-slate-800 flex justify-end gap-2 text-xs">
        <button type="button" onclick="document.getElementById('camModal').classList.add('hidden')" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
          Annulla
        </button>
        <button type="button" id="btnApplyCam" class="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition">
          Conferma Conformità CAM e Spunta
        </button>
      </div>
    </div>
  `;

  document.getElementById("btnApplyCam")?.addEventListener("click", () => {
    const chk = document.getElementById("w_busta_b_cam");
    if (chk) chk.checked = true;
    currentWizardData.step3_data.busta_b_criteri_cam = true;

    window.addNewGaraNote("BUSTE", "[CAM Art. 57] Conformità ai Criteri Ambientali Minimi verificata e confermata per Busta Tecnica.");
    document.getElementById("camModal").classList.add("hidden");
    showNotification("Conformità CAM registrata con successo!");
  });

  modal.classList.remove("hidden");
};

/**
 * 6. Pipeline Calcolatore Analitico Manodopera & Oneri Sicurezza (art. 108 c.9)
 */
window.openManodoperaModal = function() {
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};
  const s3 = currentWizardData?.step3_data || {};
  const offeredPrice = s3.busta_c_offered_price || tender.amount || 50000;

  let modal = document.getElementById("manodoperaModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "manodoperaModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const renderContent = () => {
    modal.innerHTML = `
      <div class="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold text-sm">👷</span>
            <div>
              <h3 class="text-sm font-bold text-white">Calcolatore Analitico Costo Manodopera &amp; Sicurezza</h3>
              <p class="text-[11px] text-amber-300/80 font-mono">D.Lgs. 36/2023 art. 108 c. 9 &bull; Scorporo Inderogabile</p>
            </div>
          </div>
          <button onclick="document.getElementById('manodoperaModal').classList.add('hidden')" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-sm">✕</button>
        </div>

        <div class="bg-amber-950/30 p-3 rounded-2xl border border-amber-800/40 text-amber-200 text-xs space-y-1">
          <strong>💡 Regola fondamentale di legge:</strong>
          <p class="text-slate-200 text-[11px] leading-relaxed">
            La manodopera non è un costo aggiuntivo pagato dalla PA, ma la parte del tuo prezzo netto che spendi per i tecnici e gli addetti. Deve essere realistica secondo le tabelle ministeriali del lavoro.
          </p>
        </div>

        <div class="space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-slate-300 font-semibold mb-1">Ore Lavoro Totali Stimate:</label>
              <input id="inputManoHours" type="number" value="${Math.round(offeredPrice * 0.25 / 30)}" min="1" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-cyan-300 font-mono text-xs focus:border-amber-400">
            </div>
            <div>
              <label class="block text-slate-300 font-semibold mb-1">Costo Orario CCNL (€/ora):</label>
              <input id="inputManoRate" type="number" step="0.5" value="30.0" min="15" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-cyan-300 font-mono text-xs focus:border-amber-400">
            </div>
          </div>

          <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
            <div class="flex items-center justify-between text-slate-300 font-mono">
              <span>Totale Manodopera Risultante:</span>
              <strong id="labelCalcMano" class="text-amber-400 text-sm font-bold">€ 0,00</strong>
            </div>
            <div class="flex items-center justify-between text-slate-300 font-mono">
              <span>Oneri Sicurezza Aziendali (D.Lgs. 81/08 ~2%):</span>
              <strong id="labelCalcSic" class="text-amber-400 text-sm font-bold">€ 0,00</strong>
            </div>
            <div class="pt-1.5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Incidenza sul prezzo offerto:</span>
              <span id="labelIncidenzaPct" class="font-bold text-slate-200">0%</span>
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-800 flex justify-end gap-2 text-xs">
          <button type="button" onclick="document.getElementById('manodoperaModal').classList.add('hidden')" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
            Annulla
          </button>
          <button type="button" id="btnApplyManodopera" class="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition">
            Applica Valori alla Busta C
          </button>
        </div>
      </div>
    `;

    const recalc = () => {
      const hours = parseFloat(document.getElementById("inputManoHours")?.value) || 0;
      const rate = parseFloat(document.getElementById("inputManoRate")?.value) || 0;
      const totalMano = Math.round(hours * rate);
      const totalSic = Math.round(offeredPrice * 0.02);
      const incidenza = offeredPrice > 0 ? ((totalMano / offeredPrice) * 100).toFixed(1) : 0;

      const elM = document.getElementById("labelCalcMano");
      const elS = document.getElementById("labelCalcSic");
      const elI = document.getElementById("labelIncidenzaPct");

      if (elM) elM.textContent = formatEUR(totalMano);
      if (elS) elS.textContent = formatEUR(totalSic);
      if (elI) elI.textContent = `${incidenza}% del prezzo netto`;
    };

    document.getElementById("inputManoHours")?.addEventListener("input", recalc);
    document.getElementById("inputManoRate")?.addEventListener("input", recalc);
    recalc();

    document.getElementById("btnApplyManodopera")?.addEventListener("click", () => {
      const hours = parseFloat(document.getElementById("inputManoHours")?.value) || 0;
      const rate = parseFloat(document.getElementById("inputManoRate")?.value) || 0;
      const totalMano = Math.round(hours * rate);
      const totalSic = Math.round(offeredPrice * 0.02);

      const manoInp = document.getElementById("w_manodopera");
      const sicInp = document.getElementById("w_sicurezza");

      if (manoInp) manoInp.value = totalMano;
      if (sicInp) sicInp.value = totalSic;

      currentWizardData.step3_data.busta_c_manodopera = totalMano;
      currentWizardData.step3_data.busta_c_sicurezza = totalSic;

      window.addNewGaraNote("BUSTE", `[Scorporo art. 108 c.9] Calcolata manodopera su CCNL (${hours}h x ${rate}€/h = ${formatEUR(totalMano)}) e sicurezza ${formatEUR(totalSic)}.`);
      document.getElementById("manodoperaModal").classList.add("hidden");
      showNotification("Valori manodopera e sicurezza applicati alla Busta C!");
    });
  };

  renderContent();
  modal.classList.remove("hidden");
};

/**
 * ==============================================================================
 * EXPORT & DOWNLOAD DOCUMENTI FASE 3
 * ==============================================================================
 */

/**
 * Scarica la Domanda di Partecipazione & Dichiarazione Integrativa (Fase 3) in Word (.doc / .docx)
 */
window.downloadFase3Istanza = function(format = 'docx') {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  const s1 = d.step1_data || {};
  const s3 = d.step3_data || {};
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};

  const params = {
    cig: s1.cig || tender.cig || "GARA",
    title: s1.title || tender.title || "Procedura di Gara",
    authority: s1.authority || tender.authority || "Stazione Appaltante",
    rup: s1.rup_name || tender.rup || "Responsabile Unico del Progetto",
    companyName: "La scrivente Impresa Concorrente",
    piva: "P.IVA Aziendale",
    legalRep: "Il Legale Rappresentante",
    sedeLegale: "Sede Operativa",
    pec: "ufficiogare@pec.it",
    fvoe: s3.busta_a_fvoe_passoe || "FVOE-IN-ATTESA",
    offered_price: s3.busta_c_offered_price || tender.amount || 0,
    discount_pct: s3.busta_c_discount_pct || 5.5,
    manodopera: s3.busta_c_manodopera || 0,
    sicurezza: s3.busta_c_sicurezza || 0,
    fornitura_senza_posa: Boolean(s3.fornitura_senza_posa)
  };

  const cigSafe = (params.cig || "gara").replace(/[^a-zA-Z0-9_-]/g, "_");
  const htmlContent = typeof LegalTemplates !== "undefined"
    ? LegalTemplates.generateFase3IstanzaHtml(params)
    : `<html><body><h1>Domanda Partecipazione CIG ${params.cig}</h1></body></html>`;

  const blob = new Blob([htmlContent], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `domanda_partecipazione_${cigSafe}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showNotification("Domanda di Partecipazione Word (.doc) scaricata!");
};

/**
 * Scarica il Fascicolo Operativo Buste in formato Markdown (.md)
 */
window.downloadFase3FascicoloMd = function() {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  const s1 = d.step1_data || {};
  const s3 = d.step3_data || {};
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};

  const params = {
    cig: s1.cig || tender.cig || "GARA",
    title: s1.title || tender.title || "Procedura di Gara",
    authority: s1.authority || tender.authority || "Stazione Appaltante",
    offered_price: s3.busta_c_offered_price || tender.amount || 0,
    discount_pct: s3.busta_c_discount_pct || 5.5,
    manodopera: s3.busta_c_manodopera || 0,
    sicurezza: s3.busta_c_sicurezza || 0,
    fornitura_senza_posa: Boolean(s3.fornitura_senza_posa),
    fvoe: s3.busta_a_fvoe_passoe || "FVOE-IN-ATTESA",
    busta_a_dgue_ready: Boolean(s3.busta_a_dgue_ready),
    busta_a_fideiussione_ready: Boolean(s3.busta_a_fideiussione_ready),
    busta_b_ready: Boolean(s3.busta_b_ready),
    busta_b_criteri_cam: Boolean(s3.busta_b_criteri_cam)
  };

  const cigSafe = (params.cig || "gara").replace(/[^a-zA-Z0-9_-]/g, "_");
  const mdContent = typeof LegalTemplates !== "undefined"
    ? LegalTemplates.generateFase3FascicoloMd(params)
    : `# FASCICOLO BUSTE CIG ${params.cig}`;

  window.downloadTextFile(`fascicolo_buste_${cigSafe}.md`, mdContent);
  showNotification("Fascicolo Buste Markdown (.md) scaricato!");
};

/**
 * Scarica il Computo Offerta Economica in formato CSV compatibile Excel
 */
window.downloadFase3ComputoCsv = function() {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  const s1 = d.step1_data || {};
  const s3 = d.step3_data || {};
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};

  const params = {
    cig: s1.cig || tender.cig || "GARA",
    title: s1.title || tender.title || "Procedura di Gara",
    authority: s1.authority || tender.authority || "Stazione Appaltante",
    base_amount: s3.busta_c_base_amount || tender.amount || 0,
    discount_pct: s3.busta_c_discount_pct || 5.5,
    offered_price: s3.busta_c_offered_price || tender.amount || 0,
    manodopera: s3.busta_c_manodopera || 0,
    sicurezza: s3.busta_c_sicurezza || 0,
    fornitura_senza_posa: Boolean(s3.fornitura_senza_posa)
  };

  const cigSafe = (params.cig || "gara").replace(/[^a-zA-Z0-9_-]/g, "_");
  const csvContent = typeof LegalTemplates !== "undefined"
    ? LegalTemplates.generateFase3ComputoCsv(params)
    : `\uFEFFCIG;${params.cig}\nOfferta;${params.offered_price}`;

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `computo_offerta_${cigSafe}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showNotification("Computo Offerta Economica Excel (.csv) scaricato!");
};

/**
 * Scarica il payload JSON completo delle 3 Buste
 */
window.downloadFase3Json = function() {
  readInputsFromWizardDOM();
  const d = currentWizardData;
  const s1 = d.step1_data || {};
  const s3 = d.step3_data || {};
  const tender = (typeof getAllTendersFromSQLite === "function" ? getAllTendersFromSQLite() : []).find(t => t.id === currentWizardGaraId) || {};

  const params = {
    cig: s1.cig || tender.cig || "GARA",
    title: s1.title || tender.title || "Procedura di Gara",
    authority: s1.authority || tender.authority || "Stazione Appaltante",
    rup: s1.rup_name || tender.rup || "N/D",
    base_amount: s3.busta_c_base_amount || tender.amount || 0,
    discount_pct: s3.busta_c_discount_pct || 5.5,
    offered_price: s3.busta_c_offered_price || 0,
    manodopera: s3.busta_c_manodopera || 0,
    sicurezza: s3.busta_c_sicurezza || 0,
    fornitura_senza_posa: Boolean(s3.fornitura_senza_posa),
    offerta_inviata: Boolean(s3.offerta_inviata),
    busta_a_dgue_ready: Boolean(s3.busta_a_dgue_ready),
    busta_a_fideiussione_ready: Boolean(s3.busta_a_fideiussione_ready),
    fvoe: s3.busta_a_fvoe_passoe || "",
    busta_a_files: s3.busta_a_files || [],
    busta_b_ready: Boolean(s3.busta_b_ready),
    busta_b_criteri_cam: Boolean(s3.busta_b_criteri_cam),
    busta_b_files: s3.busta_b_files || [],
    busta_c_files: s3.busta_c_files || []
  };

  const cigSafe = (params.cig || "gara").replace(/[^a-zA-Z0-9_-]/g, "_");
  const jsonObj = typeof LegalTemplates !== "undefined"
    ? LegalTemplates.generateFase3Json(params)
    : params;

  const jsonStr = JSON.stringify(jsonObj, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payload_buste_${cigSafe}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showNotification("Payload Buste JSON scaricato!");
};



