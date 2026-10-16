/**
 * MePA & Consip Desk Pro - Suite di test automatizzati per WizardRules
 * Eseguibile con: node test_wizard_rules.js
 */
const assert = require("assert");
const WizardRules = require("./js/wizard-rules.js");

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

console.log("=== TEST SUITE: WIZARD DETERMINISTICO & NORMATIVO D.LGS. 36/2023 ===\n");

// 1. Validazione CIG
test("CIG: Riconosce CIG ordinario a 10 caratteri", () => {
  const r = WizardRules.validateCig("9876543210");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cig, "9876543210");
});

test("CIG: Normalizza in maiuscolo e rimuove spazi", () => {
  const r = WizardRules.validateCig("  a1b2c3d4e5  ");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cig, "A1B2C3D4E5");
});

test("CIG: Rifiuta CIG inferiore a 10 caratteri", () => {
  const r = WizardRules.validateCig("12345");
  assert.strictEqual(r.ok, false);
  assert.ok(r.msg.includes("10 caratteri"));
});

test("CIG: Rifiuta caratteri non alfanumerici", () => {
  const r = WizardRules.validateCig("ABC-12345!");
  assert.strictEqual(r.ok, false);
});

// 2. Scadenze e Q&A
test("Date: Calcola default Q&A a 10 giorni prima", () => {
  const qa = WizardRules.defaultQaDeadline("2026-12-20T18:00:00", 10);
  assert.strictEqual(qa, "2026-12-10");
});

// 3. Calcolo Cauzione Provvisoria (Art. 106 c. 8)
test("Garanzia: Calcolo base al 2% su 100.000€ = 2.000€", () => {
  const g = WizardRules.computeGuarantee({ base: 100000, ratePct: 2 });
  assert.strictEqual(g.gross, 2000);
  assert.strictEqual(g.amount, 2000);
  assert.strictEqual(g.mainReductionPct, 0);
});

test("Garanzia: Riduzione 30% per certificazione ISO 9001", () => {
  const g = WizardRules.computeGuarantee({ base: 100000, ratePct: 2, iso9001: true });
  assert.strictEqual(g.gross, 2000);
  assert.strictEqual(g.mainReductionPct, 30);
  assert.strictEqual(g.amount, 1400); // 2000 - 30% = 1400
});

test("Garanzia: Riduzione 50% per PMI (non cumulabile con ISO 9001, prevale la maggiore)", () => {
  const g = WizardRules.computeGuarantee({ base: 100000, ratePct: 2, iso9001: true, pmi: true });
  assert.strictEqual(g.gross, 2000);
  assert.strictEqual(g.mainReductionPct, 50); // Prevale PMI
  assert.strictEqual(g.amount, 1000); // 2000 - 50% = 1000
});

test("Garanzia: Riduzione extra 10% per fideiussione digitale", () => {
  const g = WizardRules.computeGuarantee({ base: 100000, ratePct: 2, pmi: true, extraReductionPct: 10 });
  assert.strictEqual(g.amount, 900); // 1000 - 10% = 900
});

// 4. Economia e Marginalità
test("Economia: Calcola prezzo netto e sconto euro", () => {
  const ec = WizardRules.computeEconomics({ base: 100000, discountPct: 5 });
  assert.strictEqual(ec.offered, 95000);
  assert.strictEqual(ec.discountEuro, 5000);
});

test("Economia: Calcola margine residuo post-ribasso", () => {
  // Margine stimato 20%, ribasso 10% -> margine residuo = (1 - (0.8 / 0.9)) * 100 = 11.11%
  const eff = WizardRules.marginAtDiscount(20, 10);
  assert.strictEqual(eff, 11.11);
});

test("Economia: Rileva offerta in perdita se ribasso > margine stimato", () => {
  const eff = WizardRules.marginAtDiscount(10, 15);
  assert.ok(eff < 0);
});

// 5. Validazione Step 1
test("Validazione Step 1: Blocca se CIG o scadenza mancano", () => {
  const v = WizardRules.validateStep(1, {
    step1_data: { cig: "", authority: "", title: "", deadline: "" }
  });
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(e => e.field === "w_cig"));
  assert.ok(v.errors.some(e => e.field === "w_deadline"));
});

test("Validazione Step 1: Accetta dati completi con scadenza futura", () => {
  const future = new Date(Date.now() + 86400000 * 15).toISOString();
  const v = WizardRules.validateStep(1, {
    step1_data: {
      cig: "9876543210",
      authority: "Comune di Roma",
      title: "Fornitura PC",
      deadline: future,
      qa_deadline: WizardRules.defaultQaDeadline(future)
    }
  });
  assert.strictEqual(v.ok, true);
});

// 6. Validazione Step 2 (Go / No-Go)
test("Validazione Step 2: Blocca se delibera GO ma margine <= 0", () => {
  const v = WizardRules.validateStep(2, {
    step2_data: { go_decision: "GO", margin_estimated_pct: 0 }
  });
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(e => e.field === "w_margin_pct"));
});

test("Validazione Step 2: Accetta NO-GO senza vincoli di margine", () => {
  const v = WizardRules.validateStep(2, {
    step2_data: { go_decision: "NO_GO", margin_estimated_pct: 0 }
  });
  assert.strictEqual(v.ok, true);
});

// 7. Gating tra Step
test("Gating: Impedisce accesso a Fase 3 se Fase 2 è NO-GO", () => {
  const future = new Date(Date.now() + 86400000 * 15).toISOString();
  const data = {
    step1_data: { cig: "9876543210", authority: "Comune", title: "Gara", deadline: future },
    step2_data: { go_decision: "NO_GO" }
  };
  const g = WizardRules.canEnterStep(3, data);
  assert.strictEqual(g.ok, false);
  assert.strictEqual(g.blockingStep, 2);
});

test("Gating: Consente accesso a Fase 3 solo se Fase 1 e 2 sono valide con GO", () => {
  const future = new Date(Date.now() + 86400000 * 15).toISOString();
  const data = {
    step1_data: { cig: "9876543210", authority: "Comune", title: "Gara", deadline: future },
    step2_data: { go_decision: "GO", margin_estimated_pct: 12 }
  };
  const g = WizardRules.canEnterStep(3, data);
  assert.strictEqual(g.ok, true);
});

// 8. Validazione Step 3 (Manodopera e Buste)
test("Validazione Step 3: Esige costi manodopera se fornitura non esente (art. 108 c.9)", () => {
  const v = WizardRules.validateStep(3, {
    step3_data: {
      busta_a_dgue_ready: true,
      busta_a_fideiussione_ready: true,
      busta_a_fvoe_passoe: "FVOE-12345",
      busta_b_ready: true,
      busta_c_base_amount: 100000,
      busta_c_discount_pct: 5,
      fornitura_senza_posa: false,
      busta_c_manodopera: 0,
      busta_c_sicurezza: 0,
      offerta_inviata: true
    }
  });
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(e => e.field === "w_manodopera"));
});

test("Validazione Step 3: Consente manodopera = 0 se fornitura_senza_posa è spuntata", () => {
  const v = WizardRules.validateStep(3, {
    step3_data: {
      busta_a_dgue_ready: true,
      busta_a_fideiussione_ready: true,
      busta_a_fvoe_passoe: "FVOE-12345",
      busta_b_ready: true,
      busta_c_base_amount: 100000,
      busta_c_discount_pct: 5,
      fornitura_senza_posa: true,
      busta_c_manodopera: 0,
      busta_c_sicurezza: 0,
      offerta_inviata: true
    }
  });
  assert.strictEqual(v.ok, true);
});

// 9. Derivazione Stato Gara
test("Derivazione Stato: NO_GO -> Scartata", () => {
  const st = WizardRules.deriveGaraStatus({ step2_data: { go_decision: "NO_GO" } });
  assert.strictEqual(st, "Scartata");
});

test("Derivazione Stato: GO -> In Lavorazione", () => {
  const st = WizardRules.deriveGaraStatus({ step2_data: { go_decision: "GO" } });
  assert.strictEqual(st, "In Lavorazione");
});

test("Derivazione Stato: Offerta inviata -> Inviata", () => {
  const st = WizardRules.deriveGaraStatus({
    step2_data: { go_decision: "GO" },
    step3_data: { offerta_inviata: true }
  });
  assert.strictEqual(st, "Inviata");
});

test("Derivazione Stato: Outcome Fase 4 Vinta -> Vinta", () => {
  const st = WizardRules.deriveGaraStatus({
    step4_data: { outcome: "Vinta" }
  });
  assert.strictEqual(st, "Vinta");
});

// 10. Payload Agente
test("Payload Agente: Costruisce JSON strutturato con readiness e checklist", () => {
  const future = new Date(Date.now() + 86400000 * 15).toISOString();
  const data = {
    gara_id: "T1",
    step1_data: { cig: "9876543210", authority: "Comune", title: "Fornitura Server", deadline: future },
    step2_data: { go_decision: "GO", margin_estimated_pct: 15, check_fatturato: true, check_garanzie: true },
    step3_data: {
      busta_a_dgue_ready: true,
      busta_a_fideiussione_ready: true,
      busta_a_fvoe_passoe: "FVOE-999",
      busta_b_ready: true,
      busta_c_base_amount: 100000,
      busta_c_discount_pct: 5,
      busta_c_offered_price: 95000,
      busta_c_manodopera: 20000,
      busta_c_sicurezza: 2000,
      offerta_inviata: true
    },
    step4_data: { outcome: "In Valutazione" }
  };

  const payload = WizardRules.buildAgentPayload(data);
  assert.strictEqual(payload.contract_type, "mepa_consip_tender_payload");
  assert.strictEqual(payload.readiness.ready_to_submit, true);
  assert.strictEqual(payload.tender.cig, "9876543210");
  assert.ok(payload.agent_instructions.length > 0);
});

console.log(`\nRisultato: ${passedTests}/${totalTests} test superati con successo.\n`);
if (passedTests !== totalTests) {
  process.exit(1);
}
