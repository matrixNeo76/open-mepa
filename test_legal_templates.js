/**
 * MePA & Consip Desk Pro - Suite di test per LegalTemplates & Document Generator
 * Eseguibile con: node test_legal_templates.js
 */
const assert = require("assert");
const LegalTemplates = require("./js/legal-templates.js");

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(e);
  }
}

console.log("=== TEST SUITE: LEGAL TEMPLATES & ICALENDAR RFC 5545 (MILESTONE 4) ===\n");

// 1. Fac-simile Q&A ex art. 92 c.2 D.Lgs. 36/2023
test("Q&A: Genera fac-simile conforme art. 92 c.2 con CIG e RUP", () => {
  const text = LegalTemplates.generateQaRequestText({
    cig: "9876543210",
    authority: "Comune di Milano",
    rup: "Arch. Mario Rossi",
    title: "Appalto per fornitura arredi scolastici",
    question: "Si chiede conferma se il campionario debba essere allegato fisicamente.",
    deadline: "2026-11-20T12:00:00",
    qa_deadline: "2026-11-10T12:00:00",
    companyName: "Arredi Italia S.r.l.",
    piva: "01234567890",
    legalRep: "Giuseppe Verdi"
  });

  assert.ok(text.includes("CIG: 9876543210"));
  assert.ok(text.includes("Comune di Milano"));
  assert.ok(text.includes("Arch. Mario Rossi"));
  assert.ok(text.includes("ART. 92, COMMA 2, D.LGS. 36/2023"));
  assert.ok(text.includes("almeno sei giorni prima della scadenza"));
  assert.ok(text.includes("Arredi Italia S.r.l."));
  assert.ok(text.includes("Giuseppe Verdi"));
  assert.ok(text.includes("Si chiede conferma se il campionario debba essere allegato fisicamente."));
});

// 2. Fac-simile Svincolo Cauzione ex art. 106 c.10 D.Lgs. 36/2023
test("Svincolo: Genera PEC formale conforme art. 106 c.10", () => {
  const text = LegalTemplates.generateGuaranteeReleaseRequestText({
    cig: "9876543210",
    authority: "ASL Roma 1",
    rup: "Dott. Bianchi",
    title: "Fornitura sistemi diagnostici",
    policyNumber: "POL-2026-88712",
    guarantor: "Assicurazioni Generali S.p.A.",
    amount: 5400.00,
    outcome: "Non Aggiudicata (conclusa)",
    companyName: "Medical Tech S.r.l.",
    piva: "99887766554",
    legalRep: "Laura Neri"
  });

  assert.ok(text.includes("ART. 106, COMMA 10, D.LGS. 36/2023"));
  assert.ok(text.includes("CIG: 9876543210"));
  assert.ok(text.includes("POL-2026-88712"));
  assert.ok(text.includes("Assicurazioni Generali S.p.A."));
  assert.ok(text.includes("5.400,00"));
  assert.ok(text.includes("cessa automaticamente con l'aggiudicazione definitiva"));
  assert.ok(text.includes("Medical Tech S.r.l."));
});

// 3. Generazione iCalendar RFC 5545 (.ics)
test("iCalendar: Genera VCALENDAR valido conforme RFC 5545", () => {
  const tender = {
    id: "T1",
    cig: "9876543210",
    title: "Fornitura PC e Monitor per uffici comunali",
    authority: "Comune di Torino",
    amount: 85000.0,
    deadline: "2026-11-15T10:00:00",
    link: "https://www.acquistinretepa.it"
  };

  const ics = LegalTemplates.generateIcsCalendar(tender);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.includes("VERSION:2.0\r\n"));
  assert.ok(ics.includes("PRODID:-//MePA and Consip Desk Pro//IT\r\n"));
  assert.ok(ics.includes("BEGIN:VEVENT\r\n"));
  assert.ok(ics.includes("UID:mepa-9876543210-"));
  assert.ok(ics.includes("SUMMARY:[Scadenza MePA] 9876543210 - Fornitura PC e Monitor"));
  assert.ok(ics.includes("TRIGGER:-P1D\r\n")); // Promemoria 24h
  assert.ok(ics.includes("TRIGGER:-PT3H\r\n")); // Allarme urgente 3h
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("iCalendar: Supporta lista di gare multiple per export massivo", () => {
  const tenders = [
    { id: "T1", cig: "CIG0000001", title: "Gara 1", deadline: "2026-11-01T10:00:00" },
    { id: "T2", cig: "CIG0000002", title: "Gara 2", deadline: "2026-11-05T15:00:00" }
  ];

  const ics = LegalTemplates.generateIcsCalendar(tenders);
  const eventMatches = ics.match(/BEGIN:VEVENT/g) || [];
  assert.strictEqual(eventMatches.length, 2);
  assert.ok(ics.includes("CIG0000001"));
  assert.ok(ics.includes("CIG0000002"));
});

// 4. Scheda Bando Fase 1 (Word HTML & Markdown)
test("Fase 1: Genera Scheda Bando in formato Word HTML e Markdown", () => {
  const p = {
    cig: "B123456789",
    title: "Servizi Cloud per la PA",
    authority: "Regione Lazio",
    rup: "Ing. Rossi",
    amount: 150000,
    deadline: "2026-12-01T14:00:00",
    qa_deadline: "2026-11-20T12:00:00",
    link: "https://www.acquistinretepa.it/rdo/123",
    notes: "Note di gara per il team tecnico"
  };

  const html = LegalTemplates.generateFase1SchedaHtml(p);
  assert.ok(html.includes("xmlns:w='urn:schemas-microsoft-com:office:word'"));
  assert.ok(html.includes("B123456789"));
  assert.ok(html.includes("Servizi Cloud per la PA"));
  assert.ok(html.includes("Regione Lazio"));
  assert.ok(html.includes("150.000,00"));

  const md = LegalTemplates.generateFase1SchedaMd(p);
  assert.ok(md.includes("# SCHEDA SINTETICA PROCEDURA DI GARA"));
  assert.ok(md.includes("`B123456789`"));
  assert.ok(md.includes("Art. 92, comma 2"));
});

// 5. Verbale Delibera Go/No-Go Fase 2 (Word HTML & Markdown)
test("Fase 2: Genera Verbale Delibera Go/No-Go conforme", () => {
  const p = {
    cig: "A987654321",
    title: "Fornitura Switch e Cablaggio",
    authority: "Comune di Firenze",
    rup: "Dott. Bianchi",
    amount: 80000,
    deadline: "2026-12-10T12:00:00",
    go_decision: "GO",
    margin_estimated_pct: 14.5,
    check_fatturato: true,
    check_iso: true,
    check_sopralluogo: true,
    check_garanzie: true,
    notes: "Commessa ad elevata marginalità strategica"
  };

  const html = LegalTemplates.generateFase2VerbaleHtml(p);
  assert.ok(html.includes("VERBALE DI QUALIFICAZIONE E DELIBERA PARTECIPAZIONE"));
  assert.ok(html.includes("DELIBERA FAVOREVOLE (GO)"));
  assert.ok(html.includes("A987654321"));
  assert.ok(html.includes("14.5%"));
  assert.ok(html.includes("Firma digitale per approvazione"));

  const md = LegalTemplates.generateFase2VerbaleMd(p);
  assert.ok(md.includes("🟢 GO - PARTECIPAZIONE APPROVATA"));
  assert.ok(md.includes("Fatturato Triennale Specifico"));
});

// 6. Business Case CSV per Microsoft Excel
test("Fase 2: Genera CSV Business Case formattato con BOM UTF-8 e ';'", () => {
  const p = {
    cig: "C112233445",
    title: "Assistenza Sistemistica",
    authority: "Ministero della Difesa",
    amount: 200000,
    discount_pct: 7.0,
    margin_estimated_pct: 12.0,
    go_decision: "GO"
  };

  const csv = LegalTemplates.generateFase2BusinessCaseCsv(p);
  assert.ok(csv.startsWith("\uFEFF"), "Deve contenere BOM UTF-8 per compatibilità Excel");
  assert.ok(csv.includes("CIG ANAC;C112233445"));
  assert.ok(csv.includes("Importo a Base di Gara;200000,00"));
  assert.ok(csv.includes("Art. 108 c. 9 D.Lgs. 36/2023"));
  assert.ok(csv.includes("MARGINE OPERATIVO NETTO FINALE"));
});

// 7. Esportazione JSON Qualificazione Fase 2
test("Fase 2: Genera JSON strutturato per fascicolo e agenti", () => {
  const p = {
    cig: "D998877665",
    title: "Noleggio Stampanti Multifunzione",
    authority: "INPS Roma",
    amount: 45000,
    check_fatturato: true,
    check_iso: false,
    check_sopralluogo: true,
    check_garanzie: true,
    margin_estimated_pct: 9.5,
    go_decision: "GO",
    notes: "Approvato con riserva su certificazione ISO"
  };

  const json = LegalTemplates.generateFase2Json(p);
  assert.strictEqual(json.metadata.version, "2.0");
  assert.strictEqual(json.tender.cig, "D998877665");
  assert.strictEqual(json.qualification_checklist.check_fatturato, true);
  assert.strictEqual(json.qualification_checklist.check_iso, false);
  assert.strictEqual(json.deliberation.outcome, "GO");
  assert.strictEqual(json.business_case.target_sustainable, true);
});

console.log(`\nRisultato: ${passedTests}/${totalTests} test superati con successo.\n`);
if (passedTests !== totalTests) {
  process.exit(1);
}

