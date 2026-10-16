/**
 * MePA & Consip Desk Pro - Regole deterministiche del Wizard (modulo puro, senza DOM).
 *
 * Contiene validazioni, gate tra le fasi, calcoli economici e costruzione del payload per agenti.
 * Funziona sia nel browser (window.WizardRules) sia in Node (require) per essere testato in CI.
 *
 * NOTA: i parametri normativi (percentuali garanzia, riduzioni, termini) sono un supporto operativo
 * basato sul D.Lgs. 36/2023 e vanno sempre confrontati con il disciplinare della singola gara.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WizardRules = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CONCLUDED = ["Vinta", "Persa", "Scartata"];
  const MIN_SAFE_MARGIN_PCT = 8;

  /** Parametri normativi riferiti all'art. 106 D.Lgs. 36/2023 (da verificare nel disciplinare). */
  const GUARANTEE = {
    defaultRatePct: 2,
    minRatePct: 1,
    maxRatePct: 4,
    iso9001ReductionPct: 30,
    pmiReductionPct: 50 // non cumulabile con ISO 9001: si applica la maggiore
  };

  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const num = v => {
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };
  const isBlank = v => v === undefined || v === null || String(v).trim() === "";
  const err = (field, msg) => ({ field, msg });

  // ---------------------------------------------------------------- CIG
  /**
   * Il CIG e' un codice alfanumerico di 10 caratteri. Lo SmartCIG e' stato abolito dal 1/1/2024
   * (il CIG si acquisisce dalle piattaforme certificate che dialogano con la PCP ANAC).
   */
  function validateCig(raw) {
    const cig = String(raw === undefined || raw === null ? "" : raw).trim().toUpperCase();
    if (!cig) return { ok: false, cig, msg: "CIG mancante." };
    if (cig.length !== 10) return { ok: false, cig, msg: `Il CIG deve avere 10 caratteri (ne hai inseriti ${cig.length}).` };
    if (!/^[0-9A-Z]{10}$/.test(cig)) return { ok: false, cig, msg: "Il CIG puo' contenere solo lettere e numeri." };
    return { ok: true, cig, msg: "" };
  }

  // ---------------------------------------------------------------- date
  function parseDate(s) {
    if (isBlank(s)) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Proposta per il termine chiarimenti: N giorni prima della scadenza (modificabile dall'utente). */
  function defaultQaDeadline(deadlineStr, daysBefore = 10) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(deadlineStr || ""));
    if (!m) return "";
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    d.setUTCDate(d.getUTCDate() - daysBefore);
    return d.toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------- calcoli economici
  function computeGuarantee({ base = 0, ratePct = GUARANTEE.defaultRatePct, iso9001 = false, pmi = false, extraReductionPct = 0 } = {}) {
    const rate = num(ratePct);
    const gross = num(base) * (Number.isFinite(rate) ? rate : 0) / 100;
    const mainReductionPct = pmi ? GUARANTEE.pmiReductionPct : (iso9001 ? GUARANTEE.iso9001ReductionPct : 0);
    const extra = Math.min(Math.max(num(extraReductionPct) || 0, 0), 100);
    const amount = gross * (1 - mainReductionPct / 100) * (1 - extra / 100);
    return {
      ratePct: rate,
      rateInRange: rate >= GUARANTEE.minRatePct && rate <= GUARANTEE.maxRatePct,
      gross: round2(gross),
      mainReductionPct,
      amount: round2(amount)
    };
  }

  function computeEconomics({ base = 0, discountPct = 0 } = {}) {
    const b = num(base), d = num(discountPct);
    const offered = b * (1 - d / 100);
    return { offered: round2(offered), discountEuro: round2(b - offered) };
  }

  /**
   * Margine effettivo se si applica un ribasso: i costi restano fissi (base * (1 - margine stimato)).
   * Restituisce null se il ribasso e' >= 100%.
   */
  function marginAtDiscount(marginPct, discountPct) {
    const m = num(marginPct) / 100, d = num(discountPct) / 100;
    if (!Number.isFinite(m) || !Number.isFinite(d) || d >= 1) return null;
    return round2((1 - (1 - m) / (1 - d)) * 100);
  }

  /** Ribasso massimo che mantiene almeno `targetMarginPct` di margine (0 = pareggio). */
  function maxDiscountForMargin(marginPct, targetMarginPct = 0) {
    const m = num(marginPct) / 100, t = num(targetMarginPct) / 100;
    if (!Number.isFinite(m) || !Number.isFinite(t) || t >= 1) return null;
    return round2(Math.max(0, (1 - (1 - m) / (1 - t)) * 100));
  }

  // ---------------------------------------------------------------- validazione per fase
  function validateStep(step, data, opts = {}) {
    const now = opts.now ? new Date(opts.now) : new Date();
    const errors = [], warnings = [];
    const d = data || {};
    const s1 = d.step1_data || {}, s2 = d.step2_data || {}, s3 = d.step3_data || {}, s4 = d.step4_data || {};

    if (step === 1) {
      const cig = validateCig(s1.cig);
      if (!cig.ok) errors.push(err("w_cig", cig.msg));
      if (isBlank(s1.authority)) errors.push(err("w_authority", "Indica la stazione appaltante."));
      if (isBlank(s1.title)) errors.push(err("w_title", "Indica l'oggetto della gara."));

      const dl = parseDate(s1.deadline);
      if (!dl) errors.push(err("w_deadline", "Scadenza di presentazione offerta mancante o non valida."));
      else if (dl.getTime() < now.getTime()) errors.push(err("w_deadline", "La scadenza di presentazione e' gia' passata: non e' piu' possibile partecipare."));

      const qa = parseDate(s1.qa_deadline);
      if (qa && dl && qa.getTime() > dl.getTime()) errors.push(err("w_qa_deadline", "Il termine chiarimenti non puo' essere successivo alla scadenza dell'offerta."));
      if (qa && qa.getTime() + 86400000 < now.getTime()) warnings.push(err("w_qa_deadline", "Termine per i chiarimenti gia' scaduto: non potrai piu' inviare quesiti."));
      if (isBlank(s1.rup_name)) warnings.push(err("w_rup_name", "RUP non indicato: ti servira' per le comunicazioni e lo svincolo della garanzia."));
    }

    if (step === 2) {
      const margin = num(s2.margin_estimated_pct);
      if (s2.go_decision !== "GO" && s2.go_decision !== "NO_GO") {
        errors.push(err("w_go_decision", "Delibera mancante: scegli GO oppure NO-GO prima di proseguire."));
      }
      if (s2.go_decision === "GO") {
        if (!Number.isFinite(margin) || margin <= 0) errors.push(err("w_margin_pct", "Con delibera GO il margine stimato deve essere positivo."));
        else if (margin < MIN_SAFE_MARGIN_PCT) warnings.push(err("w_margin_pct", `Margine sotto l'${MIN_SAFE_MARGIN_PCT}%: rischio di perdita se i costi derivano.`));
        if (!s2.check_fatturato) warnings.push(err("w_check_fatturato", "Fatturato specifico non confermato."));
        if (!s2.check_sopralluogo) warnings.push(err("w_check_sopralluogo", "Sopralluogo non confermato (ignora se non previsto dal disciplinare)."));
        if (!s2.check_garanzie) warnings.push(err("w_check_garanzie", "Disponibilita' di fideiussione non confermata."));
      }
    }

    if (step === 3) {
      if (!s3.busta_a_dgue_ready) errors.push(err("w_busta_a_dgue", "Busta A: DGUE non confermato."));
      if (!s3.busta_a_fideiussione_ready) errors.push(err("w_busta_a_fideiussione", "Busta A: garanzia provvisoria non confermata."));
      if (isBlank(s3.busta_a_fvoe_passoe)) errors.push(err("w_fvoe_code", "Busta A: codice FVOE 2.0 mancante."));
      if (!s3.busta_b_ready) errors.push(err("w_busta_b_ready", "Busta B: relazione tecnica non confermata."));

      const disc = num(s3.busta_c_discount_pct);
      const base = num(s3.busta_c_base_amount);
      if (!Number.isFinite(base) || base <= 0) errors.push(err("w_discount_pct", "Busta C: base d'asta non valorizzata."));
      if (!Number.isFinite(disc) || disc < 0 || disc >= 100) errors.push(err("w_discount_pct", "Busta C: il ribasso deve essere compreso tra 0 e 100 (le offerte in rialzo sono inammissibili)."));

      if (!s3.fornitura_senza_posa) {
        const mano = num(s3.busta_c_manodopera), sic = num(s3.busta_c_sicurezza);
        if (!Number.isFinite(mano) || mano <= 0) errors.push(err("w_manodopera", "Busta C: costi della manodopera mancanti (obbligatori a pena di esclusione, art. 108 c.9)."));
        if (!Number.isFinite(sic) || sic <= 0) errors.push(err("w_sicurezza", "Busta C: oneri aziendali di sicurezza mancanti (obbligatori a pena di esclusione, art. 108 c.9)."));
        if (Number.isFinite(base) && Number.isFinite(disc) && disc >= 0 && disc < 100 && Number.isFinite(mano) && Number.isFinite(sic)) {
          const offered = base * (1 - disc / 100);
          if (mano + sic > offered) errors.push(err("w_manodopera", "Manodopera + sicurezza superano il prezzo offerto: valori incoerenti."));
        }
      }

      const eff = marginAtDiscount(s2.margin_estimated_pct, disc);
      if (eff !== null && eff < 0) warnings.push(err("w_discount_pct", `Con questo ribasso il margine diventa negativo (${eff}%): offerta in perdita.`));
      else if (eff !== null && eff < MIN_SAFE_MARGIN_PCT) warnings.push(err("w_discount_pct", `Con questo ribasso il margine scende al ${eff}%.`));

      const g = computeGuarantee({ base, ratePct: s3.garanzia_rate_pct, iso9001: !!s2.check_iso, pmi: !!s3.garanzia_pmi, extraReductionPct: s3.garanzia_riduzione_extra_pct });
      if (!g.rateInRange) warnings.push(err("w_garanzia_rate", `La garanzia provvisoria e' di norma tra ${GUARANTEE.minRatePct}% e ${GUARANTEE.maxRatePct}% del valore: controlla il disciplinare.`));

      if (!s3.offerta_inviata) errors.push(err("w_offerta_inviata", "Per passare alla Fase 4 conferma di aver inviato l'offerta sul portale."));
    }

    if (step === 4) {
      if (s4.fideiussione_svincolata && (s4.outcome === "In Valutazione" || isBlank(s4.outcome))) {
        warnings.push(err("w_fideiussione_svincolata", "Hai segnato la richiesta di svincolo ma la gara risulta ancora in valutazione."));
      }
    }

    return { errors, warnings, ok: errors.length === 0 };
  }

  /** Si puo' entrare nella fase `target` solo se tutte le precedenti sono valide (e la 2 e' GO). */
  function canEnterStep(target, data, opts = {}) {
    for (let s = 1; s < target; s++) {
      const v = validateStep(s, data, opts);
      if (!v.ok) return { ok: false, blockingStep: s, errors: v.errors };
      if (s === 2 && (data.step2_data || {}).go_decision !== "GO") {
        return { ok: false, blockingStep: 2, errors: [err("w_go_decision", "La gara e' stata scartata (NO-GO): non si prosegue con le buste.")] };
      }
    }
    return { ok: true, blockingStep: null, errors: [] };
  }

  // ---------------------------------------------------------------- stato gara derivato
  /**
   * Stato della gara (colonna `gare.status`) derivato in modo esplicito dal Wizard:
   * l'avanzare tra le fasi NON modifica lo stato da solo.
   */
  function deriveGaraStatus(data, currentStatus) {
    const d = data || {};
    const outcome = (d.step4_data || {}).outcome;
    if (outcome === "Vinta" || outcome === "Persa") return outcome;
    const s2 = d.step2_data || {}, s3 = d.step3_data || {};
    if (s2.go_decision === "NO_GO") return "Scartata";
    if (s3.offerta_inviata) return "Inviata";
    if (s2.go_decision === "GO") return "In Lavorazione";
    return currentStatus || "Da Valutare";
  }

  // ---------------------------------------------------------------- payload per agenti
  function buildAgentPayload(data, opts = {}) {
    const now = opts.now ? new Date(opts.now) : new Date();
    const d = data || {};
    const s1 = d.step1_data || {}, s2 = d.step2_data || {}, s3 = d.step3_data || {}, s4 = d.step4_data || {};
    const guarantee = computeGuarantee({
      base: s3.busta_c_base_amount || s1.amount, ratePct: s3.garanzia_rate_pct,
      iso9001: !!s2.check_iso, pmi: !!s3.garanzia_pmi, extraReductionPct: s3.garanzia_riduzione_extra_pct
    });
    const stepErrors = {};
    [1, 2, 3, 4].forEach(n => { stepErrors[n] = validateStep(n, d, { now }).errors.map(e => e.msg); });
    const readyToSubmit = [1, 2, 3].every(n => n === 3
      ? stepErrors[3].filter(m => !/Fase 4/.test(m)).length === 0
      : stepErrors[n].length === 0) && s2.go_decision === "GO";

    return {
      contract_type: "mepa_consip_tender_payload",
      version: "1.1",
      generated_at: now.toISOString(),
      tender: {
        id: d.gara_id, cig: s1.cig, authority: s1.authority, title: s1.title, amount: s1.amount,
        deadline: s1.deadline, qa_deadline: s1.qa_deadline, rup: s1.rup_name || null,
        portal_url: s1.link || "https://www.acquistinretepa.it"
      },
      qualification: {
        decision: s2.go_decision, margin_pct: s2.margin_estimated_pct, notes: s2.notes || "",
        checklist: { fatturato: !!s2.check_fatturato, iso9001: !!s2.check_iso, sopralluogo: !!s2.check_sopralluogo, fideiussione_disponibile: !!s2.check_garanzie }
      },
      busta_a: {
        dgue_ready: !!s3.busta_a_dgue_ready, fvoe_code: s3.busta_a_fvoe_passoe || null,
        guarantee: { ready: !!s3.busta_a_fideiussione_ready, base: s3.busta_c_base_amount, rate_pct: guarantee.ratePct, pmi: !!s3.garanzia_pmi, reduction_pct: guarantee.mainReductionPct, amount: guarantee.amount },
        files_to_upload: s3.busta_a_files || []
      },
      busta_b: { technical_ready: !!s3.busta_b_ready, cam_declared: !!s3.busta_b_criteri_cam, files_to_upload: s3.busta_b_files || [] },
      busta_c: {
        base_amount: s3.busta_c_base_amount, discount_percentage: s3.busta_c_discount_pct, offered_price: s3.busta_c_offered_price,
        manodopera_costs: s3.busta_c_manodopera, security_costs: s3.busta_c_sicurezza,
        supplies_without_installation: !!s3.fornitura_senza_posa, files_to_upload: s3.busta_c_files || []
      },
      outcome: { status: s4.outcome || null, guarantee_release_requested: !!s4.fideiussione_svincolata, notes: s4.note_conclusive || "" },
      readiness: { ready_to_submit: readyToSubmit, blocking_errors: stepErrors },
      agent_instructions: [
        "Non inserire mai credenziali: chiedi all'operatore umano di effettuare il login sul portale.",
        "Apri portal_url e individua la procedura tramite il CIG indicato in tender.cig.",
        "Se readiness.ready_to_submit e' false, FERMATI e riporta readiness.blocking_errors all'operatore.",
        "Busta A: carica solo i file elencati in busta_a.files_to_upload e inserisci il codice FVOE.",
        "Busta B: carica solo i file tecnici; non inserire alcun importo o percentuale di sconto.",
        "Busta C: inserisci ribasso, prezzo offerto, costi manodopera e oneri di sicurezza come da busta_c.",
        "La firma digitale e l'invio definitivo dell'offerta richiedono la conferma esplicita dell'operatore umano."
      ]
    };
  }

  return {
    CONCLUDED, MIN_SAFE_MARGIN_PCT, GUARANTEE,
    validateCig, defaultQaDeadline, computeGuarantee, computeEconomics,
    marginAtDiscount, maxDiscountForMargin,
    validateStep, canEnterStep, deriveGaraStatus, buildAgentPayload
  };
});
