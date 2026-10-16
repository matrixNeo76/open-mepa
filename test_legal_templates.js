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

console.log(`\nRisultato: ${passedTests}/${totalTests} test superati con successo.\n`);
if (passedTests !== totalTests) {
  process.exit(1);
}
