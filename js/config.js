/**
 * MePA & Consip Desk Pro - Configuration & Dataset Definitions
 * Link ufficiali CKAN Consip S.p.A. e seed demo data
 */

const consipDatasets = [
  {
    id: "negoziazioni",
    title: "1. Negoziazioni (RdO & Trattative)",
    badge: "FONDAMENTALE PER LE GARE",
    badgeColor: "border-cyan-500/40 text-cyan-300 bg-cyan-500/10",
    description: "Tutte le RdO e Trattative Dirette pubblicate dalle PA sul MePA con CIG, basi d'asta e scadenze.",
    ckanUrl: "https://dati.consip.it/group/cat-negoziazioni",
    fileSlug: (year) => `rdo-td-bandite-mepa-${year}`,
    hasCsv: true,
    hasJson: true,
    hasXlsx: true
  },
  {
    id: "bandiegare",
    title: "2. Bandi e Gare del Programma (Gare ASP)",
    badge: "CONVENZIONI & ACCORDI QUADRO",
    badgeColor: "border-amber-500/40 text-amber-300 bg-amber-500/10",
    description: "Macro-gare centralizzate Consip e gare per conto di singole PA (modalità ASP) divise per lotti e massimali.",
    ckanUrl: "https://dati.consip.it/dataset/gare-asp",
    fileSlug: (year) => `bandiegare${year}`,
    hasCsv: true,
    hasJson: true,
    hasXlsx: true
  },
  {
    id: "amministrazioni",
    title: "3. Amministrazioni Registrate",
    badge: "ANAGRAFICA CLIENTI PA",
    badgeColor: "border-sky-500/40 text-sky-300 bg-sky-500/10",
    description: "Elenco degli enti pubblici (Comuni, ASL, Ministeri) con Codice Fiscale, indirizzo e Punti Ordinanti abilitati.",
    ckanUrl: "https://dati.consip.it/group/cat-amministrazioni",
    fileSlug: (year) => `amministrazioni${year}`,
    hasCsv: true,
    hasJson: true,
    hasXlsx: true
  },
  {
    id: "operatorieconomici",
    title: "4. Operatori Economici",
    badge: "ALBO FORNITORI & COMPETITOR",
    badgeColor: "border-purple-500/40 text-purple-300 bg-purple-500/10",
    description: "Registro delle imprese fornitrici abilitate ai bandi MePA e aggiudicatarie di gare, con Partita IVA e sede legale.",
    ckanUrl: "https://dati.consip.it/group/cat-operatori-economici",
    fileSlug: (year) => `operatorieconomici${year}`,
    hasCsv: true,
    hasJson: true,
    hasXlsx: true
  },
  {
    id: "acquisti",
    title: "5. Acquisti Effettuati",
    badge: "SPESA EFFETTIVA & RIBASSI",
    badgeColor: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
    description: "Contratti definitivi stipulati (Ordini ODA e RdO concluse), con valori economici reali transati e aggiudicatari.",
    ckanUrl: "https://dati.consip.it/group/cat-acquisti",
    fileSlug: (year) => `acquisti${year}`,
    hasCsv: true,
    hasJson: true,
    hasXlsx: true
  },
  {
    id: "cataloghi",
    title: "6. Cataloghi Beni & Servizi (~600MB)",
    badge: "LISTINI PRODOTTI A CARRELLO",
    badgeColor: "border-pink-500/40 text-pink-300 bg-pink-500/10",
    description: "Articoli a catalogo offerti dai fornitori (~600MB / ~300.000 righe). Ingestione asincrona via server stream in tabella dedicata 'cataloghi' SQLite.",
    ckanUrl: "https://dati.consip.it/group/cat-cataloghi",
    fileSlug: (year) => `cataloghi${year}`,
    hasCsv: true,
    hasJson: true,
    hasXlsx: true
  }
];

const initialSeedTenders = [
  {
    id: "T1",
    cig: "A045B891C1",
    category: "IT",
    region: "Emilia-Romagna",
    source: "Bandi e Gare",
    authority: "Comune di Bologna - Settore Transizione Digitale",
    title: "Fornitura server rack, licenze e apparati di rete per potenziamento data center comunale",
    amount: 86500.00,
    deadline: "2026-10-19T12:00",
    status: "In Lavorazione",
    owner: "Ing. Rossi",
    link: "https://www.acquistinretepa.it"
  },
  {
    id: "T2",
    cig: "B129F447E2",
    category: "IT",
    region: "Lazio",
    source: "RdO MePA",
    authority: "ASL Roma 1 - UOC Tecnologie Informatiche",
    title: "Servizi di manutenzione evolutiva applicativi sanitari e workstation grafiche per telemedicina",
    amount: 142000.00,
    deadline: "2026-10-22T18:00",
    status: "In Lavorazione",
    owner: "Dott.ssa Bianchi",
    link: "https://www.acquistinretepa.it"
  },
  {
    id: "T3",
    cig: "C7829910D4",
    category: "CANCELLERIA",
    region: "Veneto",
    source: "RdO MePA",
    authority: "Università degli Studi di Padova",
    title: "Fornitura carta ecologica per fotocopiatori ad alta tiratura e materiale di cancelleria didattica",
    amount: 34500.00,
    deadline: "2026-10-18T14:00",
    status: "Da Valutare",
    owner: "Marco N.",
    link: "https://www.acquistinretepa.it"
  },
  {
    id: "T4",
    cig: "98741235AA",
    category: "IT",
    region: "Toscana",
    source: "Gare ASP",
    authority: "Regione Toscana - Direzione Gare",
    title: "RdO Aperta: Servizio di supporto Help Desk e gestione parco PC e postazioni di lavoro",
    amount: 320000.00,
    deadline: "2026-11-20T12:00",
    status: "Inviata",
    owner: "Team Gare",
    link: "https://www.acquistinretepa.it"
  },
  {
    id: "T5",
    cig: "96582314FF",
    category: "CANCELLERIA",
    region: "Lazio",
    source: "Bandi e Gare",
    authority: "Ministero della Giustizia",
    title: "Fornitura toner, consumabili e apparati di stampa a basso impatto ambientale (CAM Cancelleria)",
    amount: 54000.00,
    deadline: "2026-10-24T12:00",
    status: "Vinta",
    owner: "Ing. Rossi",
    link: "https://www.acquistinretepa.it"
  },
  {
    id: "T6",
    cig: "D9041285E7",
    category: "SANITA",
    region: "Lombardia",
    source: "Gare ASP",
    authority: "ASST Grande Ospedale Metropolitano Niguarda",
    title: "Fornitura reagenti di laboratorio e dispositivi diagnostici monouso",
    amount: 215000.00,
    deadline: "2026-11-12T16:00",
    status: "Da Valutare",
    owner: "Gare Sanità",
    link: "https://www.acquistinretepa.it"
  },
  {
    id: "T7",
    cig: "E4519028A1",
    category: "CANCELLERIA",
    region: "Piemonte",
    source: "RdO MePA",
    authority: "Città Metropolitana di Torino",
    title: "Fornitura carta formato A4 e A3 ecologica certificata Ecolabel per gli istituti scolastici",
    amount: 48000.00,
    deadline: "2026-10-20T10:00",
    status: "In Lavorazione",
    owner: "Ufficio Acquisti",
    link: "https://www.acquistinretepa.it"
  }
];
