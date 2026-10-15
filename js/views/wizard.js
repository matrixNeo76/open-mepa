/**
 * MePA & Consip Desk Pro - Wizard Partecipazione Gara (Workflow Deterministico a 4 Fasi)
 * Aderente ai principi D.Lgs. 36/2023, Spec-Driven Design (sddesign) e dual-handoff (manuale / browser-use agent).
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
 * Avvia o apre il Wizard per una specifica gara (o la prima attiva se null)
 */
window.openTenderWizard = async function(garaId = null) {
  const all = getAllTendersFromSQLite();
  if (all.length === 0) {
    showNotification("Nessuna gara presente. Carica dati demo o una gara per usare il Wizard.", false);
    return;
  }

  const tender = garaId ? all.find(t => t.id === garaId || t.cig === garaId) : all[0];
  if (!tender) {
    showNotification("Gara selezionata non trovata.", false);
    return;
  }

  currentWizardGaraId = tender.id;
  window.switchView("wizard");

  // Carica i dati del workflow se presenti da backend o storage locale
  await loadWizardData(currentWizardGaraId, tender);
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
      go_decision: "GO", // GO, NO_GO, PENDING
      notes: ""
    },
    step3_data: {
      active_busta: "A",
      // Busta A - Amministrativa
      busta_a_dgue_ready: false,
      busta_a_fideiussione_ready: false,
      busta_a_fideiussione_importo: Math.round((tender.amount || 0) * 0.01), // cauzione provvisoria 1%
      busta_a_fvoe_passoe: "",
      busta_a_files: [
        `CIG_${tender.cig || 'BANDO'}_BustaA_DGUE.pdf.p7m`,
        `CIG_${tender.cig || 'BANDO'}_BustaA_GaranziaProvvisoria.pdf.p7m`,
        `CIG_${tender.cig || 'BANDO'}_BustaA_DichiarazioniIntegrative.pdf.p7m`
      ],
      // Busta B - Tecnica
      busta_b_ready: false,
      busta_b_criteri_cam: true,
      busta_b_files: [
        `CIG_${tender.cig || 'BANDO'}_BustaB_OffertaTecnica.pdf.p7m`,
        `CIG_${tender.cig || 'BANDO'}_BustaB_SchedeProdotti.pdf.p7m`
      ],
      // Busta C - Economica
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
 * Renderizza l'intera schermata del Wizard
 */
function renderWizardView(tender) {
  const container = document.getElementById("view-wizard");
  if (!container) return;

  const rem = calculateTimeRemaining(tender.deadline);
  const steps = [
    { num: 1, title: "Identificazione", desc: "CIG & Dati Portale" },
    { num: 2, title: "Qualificazione", desc: "Fattibilità Go / No-Go" },
    { num: 3, title: "Le 3 Buste", desc: "Busta A, B & C" },
    { num: 4, title: "Esito & Svincolo", desc: "Chiusura & Polizze" }
  ];

  container.innerHTML = `
    <div class="space-y-6">
      <!-- TOP CONTROL & GARA SELECTOR -->
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div class="flex items-center gap-3">
          <button onclick="window.switchView('cruscotto')" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition touch-target-action" title="Torna al Cruscotto">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono font-bold text-cyan-400">GARA ATTIVA:</span>
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-300">${escapeHtml(tender.cig || '-')}</span>
              <span class="text-[11px] text-slate-400 font-medium truncate max-w-xs md:max-w-md">${escapeHtml(tender.title || '')}</span>
            </div>
            <div class="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-3">
              <span>🏛️ ${escapeHtml(tender.authority || 'Ente')}</span>
              <span>💶 <strong class="text-emerald-400">${formatEUR(tender.amount)}</strong></span>
              <span>⏰ ${rem.text}</span>
            </div>
          </div>
        </div>

        <!-- Selettore per cambiare gara rapidamente nel wizard -->
        <div class="flex items-center gap-2">
          <label class="text-[11px] text-slate-400 font-mono hidden sm:inline">Cambia Gara:</label>
          <select id="selectWizardTender" onchange="window.openTenderWizard(this.value)" class="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 text-xs font-medium focus:border-cyan-400">
            ${getAllTendersFromSQLite().map(t => `
              <option value="${escapeHtml(t.id)}" ${t.id === tender.id ? 'selected' : ''}>${escapeHtml(t.cig || t.id)} - ${escapeHtml(t.authority ? t.authority.substring(0, 20) : 'Gara')} (${formatEUR(t.amount)})</option>
            `).join('')}
          </select>
          <button onclick="window.saveCurrentWizardState()" class="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-cyan-500/20">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
            <span>Salva Avanzamento</span>
          </button>
        </div>
      </div>

      <!-- STEPPER BAR DETERMINISTICO (1 -> 2 -> 3 -> 4) -->
      <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 shadow-md">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${steps.map(s => {
            const isCompleted = s.num < currentWizardStep;
            const isCurrent = s.num === currentWizardStep;
            let stepClasses = "bg-slate-950/60 border-slate-800 text-slate-500";
            let badgeClasses = "bg-slate-800 text-slate-400 border-slate-700";

            if (isCurrent) {
              stepClasses = "bg-cyan-950/40 border-cyan-500/50 text-white ring-1 ring-cyan-500/30";
              badgeClasses = "bg-cyan-500 text-slate-950 font-extrabold";
            } else if (isCompleted) {
              stepClasses = "bg-emerald-950/20 border-emerald-500/30 text-emerald-300";
              badgeClasses = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40";
            }

            return `
              <button onclick="window.setWizardStep(${s.num})" class="text-left p-3 rounded-xl border ${stepClasses} transition flex items-center gap-3">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs ${badgeClasses} shrink-0">
                  ${isCompleted ? '✓' : s.num}
                </div>
                <div class="truncate">
                  <div class="text-xs font-bold leading-tight truncate">${s.title}</div>
                  <div class="text-[10px] text-slate-400 truncate mt-0.5">${s.desc}</div>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- WORK AREA DELLO STEP CORRENTE -->
      <div id="wizardStepContent" class="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-6">
        ${renderCurrentStepContent(tender)}
      </div>

      <!-- DOCK AZIONI RAPIDE (Copia per Portale / JSON Agente / Avanti) -->
      <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl sticky bottom-4 z-20">
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <button onclick="window.setWizardStep(${Math.max(1, currentWizardStep - 1)})" ${currentWizardStep === 1 ? 'disabled' : ''} class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed font-medium text-xs transition">
            ← Precedente
          </button>
          <button onclick="window.setWizardStep(${Math.min(4, currentWizardStep + 1)})" ${currentWizardStep === 4 ? 'disabled' : ''} class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed font-medium text-xs transition">
            Successivo →
          </button>
        </div>

        <!-- Tasti Copia per Portale & JSON Agente -->
        <div class="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
          <button onclick="window.copyStepValuesForPortal()" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-cyan-300 font-mono text-xs font-semibold transition flex items-center gap-1.5" title="Copia negli appunti i campi per incollarli su acquistinretepa.it">
            <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            <span id="btnCopyStepLabel">Copia Dati per Portale Consip</span>
          </button>

          <button onclick="window.openAgentExportModal()" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-900/40 to-indigo-900/40 hover:from-purple-900/60 hover:to-indigo-900/60 border border-purple-500/40 text-purple-200 font-mono text-xs font-semibold transition flex items-center gap-1.5" title="Genera payload strutturato JSON per browser-use / automation agent">
            <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <span>Payload Agente (Browser-Use)</span>
          </button>

          <button onclick="window.advanceStepAndSave()" class="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-cyan-500/20">
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

  if (currentWizardStep === 1) {
    return `
      <div class="space-y-4">
        <div class="border-b border-slate-800 pb-3 flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>Fase 1: Identificazione e Presa in Carico Bando</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">PORTALE CONSIP</span>
            </h3>
            <p class="text-xs text-slate-400">Verifica i codici identificativi ANAC e i termini decadenziali per le richieste di chiarimento (Q&A).</p>
          </div>
          <a href="${escapeHtml(d.step1_data.link || 'https://www.acquistinretepa.it')}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-mono inline-flex items-center gap-1 border border-slate-700">
            Apri su MePA ↗
          </a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label class="block text-slate-400 font-semibold mb-1">Codice Identificativo Gara (CIG):</label>
            <div class="flex gap-1.5">
              <input id="w_cig" type="text" value="${escapeHtml(d.step1_data.cig)}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-cyan-400 font-mono font-bold text-xs focus:border-cyan-400">
              <button onclick="navigator.clipboard.writeText(document.getElementById('w_cig').value); showNotification('CIG copiato negli appunti!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px]" title="Copia CIG">Copia</button>
            </div>
          </div>

          <div>
            <label class="block text-slate-400 font-semibold mb-1">Termine Ultimo Domande / Chiarimenti (Q&A):</label>
            <input id="w_qa_deadline" type="date" value="${escapeHtml(d.step1_data.qa_deadline)}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs focus:border-cyan-400">
          </div>

          <div>
            <label class="block text-slate-400 font-semibold mb-1">Scadenza Invio Offerte a Sistema:</label>
            <input id="w_deadline" type="datetime-local" value="${escapeHtml(d.step1_data.deadline ? d.step1_data.deadline.substring(0, 16) : '')}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-rose-300 font-mono text-xs focus:border-cyan-400">
          </div>

          <div class="md:col-span-2">
            <label class="block text-slate-400 font-semibold mb-1">Stazione Appaltante / Ente:</label>
            <input id="w_authority" type="text" value="${escapeHtml(d.step1_data.authority)}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">
          </div>

          <div>
            <label class="block text-slate-400 font-semibold mb-1">RUP (Responsabile Unico del Progetto):</label>
            <input id="w_rup_name" type="text" placeholder="Nome RUP indicato nel disciplinare..." value="${escapeHtml(d.step1_data.rup_name || '')}" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">
          </div>

          <div class="md:col-span-3">
            <label class="block text-slate-400 font-semibold mb-1">Oggetto Fornitura / Servizio:</label>
            <textarea id="w_title" rows="2" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">${escapeHtml(d.step1_data.title)}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  if (currentWizardStep === 2) {
    const s2 = d.step2_data;
    return `
      <div class="space-y-4">
        <div class="border-b border-slate-800 pb-3 flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>Fase 2: Valutazione Idoneità &amp; Delibera Go / No-Go</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">QUALIFICAZIONE</span>
            </h3>
            <p class="text-xs text-slate-400">Verifica se l'azienda possiede tutti i requisiti di legge e la capienza economica per evitare esclusioni.</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          <!-- Checklist Requisiti di Partecipazione -->
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <span class="text-xs font-mono font-bold text-slate-300 block uppercase border-b border-slate-800 pb-2">Checklist Requisiti Disciplinare</span>
            
            <label class="flex items-start gap-2.5 cursor-pointer">
              <input id="w_check_fatturato" type="checkbox" ${s2.check_fatturato ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
              <div>
                <strong class="text-slate-200 block">Fatturato Specifico nel Settore</strong>
                <span class="text-[11px] text-slate-400">Verificato fatturato triennale congruo a quanto richiesto dal bando.</span>
              </div>
            </label>

            <label class="flex items-start gap-2.5 cursor-pointer">
              <input id="w_check_iso" type="checkbox" ${s2.check_iso ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
              <div>
                <strong class="text-slate-200 block">Certificazioni di Qualità (ISO 9001 / 27001 / 14001)</strong>
                <span class="text-[11px] text-slate-400">Certificati aziendali in corso di validità conformi ai criteri ambientali CAM.</span>
              </div>
            </label>

            <label class="flex items-start gap-2.5 cursor-pointer">
              <input id="w_check_sopralluogo" type="checkbox" ${s2.check_sopralluogo ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
              <div>
                <strong class="text-slate-200 block">Sopralluogo Obbligatorio (ove previsto)</strong>
                <span class="text-[11px] text-slate-400">Attestato di sopralluogo rilasciato dalla Stazione Appaltante.</span>
              </div>
            </label>

            <label class="flex items-start gap-2.5 cursor-pointer">
              <input id="w_check_garanzie" type="checkbox" ${s2.check_garanzie ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 mt-0.5">
              <div>
                <strong class="text-slate-200 block">Fido / Castelletto Assicurativo Capiente</strong>
                <span class="text-[11px] text-slate-400">Disponibilità per emissione fideiussione provvisoria e cauzione definitiva.</span>
              </div>
            </label>
          </div>

          <!-- Decisione Go / No-Go & Margine -->
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4">
            <span class="text-xs font-mono font-bold text-slate-300 block uppercase border-b border-slate-800 pb-2">Analisi di Convenienza &amp; Decisione</span>

            <div>
              <label class="block text-slate-400 font-semibold mb-1">Margine Operativo Netto Stimato (%):</label>
              <div class="flex items-center gap-3">
                <input id="w_margin_pct" type="number" step="0.5" value="${s2.margin_estimated_pct || 12.5}" class="w-28 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold text-xs focus:border-cyan-400">
                <span class="text-slate-400 text-xs">Sopra il 10% considerata ad alta marginalità.</span>
              </div>
            </div>

            <div>
              <label class="block text-slate-400 font-semibold mb-1">Esito Valutazione Formale:</label>
              <select id="w_go_decision" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-bold text-xs focus:border-cyan-400">
                <option value="GO" ${s2.go_decision === 'GO' ? 'selected' : ''}>🟢 GO — Procedi con la formulazione dell'offerta</option>
                <option value="NO_GO" ${s2.go_decision === 'NO_GO' ? 'selected' : ''}>🔴 NO-GO — Scarta la procedura (margini bassi o requisiti mancanti)</option>
                <option value="PENDING" ${s2.go_decision === 'PENDING' ? 'selected' : ''}>🟡 IN ATTESA — In attesa di risposta a quesiti/chiarimenti</option>
              </select>
            </div>

            <div>
              <label class="block text-slate-400 font-semibold mb-1">Note del Team Gare:</label>
              <textarea id="w_step2_notes" rows="2" placeholder="Eventuali annotazioni su subappalto, consorzi o ATI..." class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">${escapeHtml(s2.notes || '')}</textarea>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (currentWizardStep === 3) {
    const s3 = d.step3_data;
    const activeBusta = s3.active_busta || "A";

    return `
      <div class="space-y-4">
        <div class="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>Fase 3: Predisposizione delle 3 Buste Telematiche</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">D.LGS. 36/2023</span>
            </h3>
            <p class="text-xs text-slate-400">Attenzione alla separazione: l'offerta economica non deve mai comparire nella documentazione tecnica.</p>
          </div>

          <!-- BUSTA SELECTOR TABS -->
          <div class="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs shrink-0">
            <button onclick="window.setWizardBustaTab('A')" class="px-3 py-1 rounded-lg font-bold transition ${activeBusta === 'A' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}">Busta A: Amministrativa</button>
            <button onclick="window.setWizardBustaTab('B')" class="px-3 py-1 rounded-lg font-bold transition ${activeBusta === 'B' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}">Busta B: Tecnica</button>
            <button onclick="window.setWizardBustaTab('C')" class="px-3 py-1 rounded-lg font-bold transition ${activeBusta === 'C' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}">Busta C: Economica</button>
          </div>
        </div>

        <!-- TAB CONTENT: BUSTA A -->
        ${activeBusta === 'A' ? `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <span class="font-mono font-bold text-cyan-400 uppercase block border-b border-slate-800 pb-2">Documentazione di Conformità (Busta A)</span>
              
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_busta_a_dgue" type="checkbox" ${s3.busta_a_dgue_ready ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
                <div>
                  <strong class="text-slate-200 block">DGUE Elettronico (ESPD XML / PDF)</strong>
                  <span class="text-[11px] text-slate-400">Compilato sul portale ANAC/MePA e firmato in formato CAdES (.p7m).</span>
                </div>
              </label>

              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_busta_a_fideiussione" type="checkbox" ${s3.busta_a_fideiussione_ready ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
                <div>
                  <strong class="text-slate-200 block">Garanzia Provvisoria ex art. 106 D.Lgs. 36/2023</strong>
                  <span class="text-[11px] text-slate-400">Polizza fideiussoria con clausola di rinuncia eccezioni e pagamento entro 15gg.</span>
                </div>
              </label>

              <div class="pt-2">
                <label class="block text-slate-400 font-semibold mb-1">Codice PassOE / Fascicolo FVOE 2.0 ANAC:</label>
                <div class="flex gap-1.5">
                  <input id="w_fvoe_code" type="text" placeholder="Es. FVOE-99214..." value="${escapeHtml(s3.busta_a_fvoe_passoe || '')}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:border-cyan-400">
                  <button onclick="navigator.clipboard.writeText(document.getElementById('w_fvoe_code').value); showNotification('Codice FVOE copiato!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px]">Copia</button>
                </div>
              </div>
            </div>

            <!-- Naming files Busta A -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <span class="font-mono font-bold text-slate-300 uppercase block border-b border-slate-800 pb-2">File Richiesti per Upload su MePA</span>
              <p class="text-[11px] text-slate-400">Firma digitalmente tutti i file in formato CAdES (.p7m). Usa la seguente nomenclatura univoca:</p>
              
              <div class="space-y-2">
                ${(s3.busta_a_files || []).map((file, idx) => `
                  <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                    <span class="font-mono text-cyan-300 text-[11px] truncate select-all">${file}</span>
                    <button onclick="navigator.clipboard.writeText('${file}'); showNotification('Nome file copiato negli appunti!');" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-cyan-950 text-slate-300 hover:text-cyan-300 font-mono text-[10px] border border-slate-700">Copia Nome</button>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        <!-- TAB CONTENT: BUSTA B -->
        ${activeBusta === 'B' ? `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <span class="font-mono font-bold text-purple-400 uppercase block border-b border-slate-800 pb-2">Offerta Tecnica (Busta B)</span>
              
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_busta_b_ready" type="checkbox" ${s3.busta_b_ready ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
                <div>
                  <strong class="text-slate-200 block">Relazione Tecnica Descrittiva Completa</strong>
                  <span class="text-[11px] text-slate-400">Impaginata entro i limiti massimi di pagine stabiliti dal disciplinare.</span>
                </div>
              </label>

              <label class="flex items-start gap-2.5 cursor-pointer">
                <input id="w_busta_b_cam" type="checkbox" ${s3.busta_b_criteri_cam ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
                <div>
                  <strong class="text-slate-200 block">Criteri Ambientali Minimi (CAM) &amp; Premialità</strong>
                  <span class="text-[11px] text-slate-400">Dichiarazioni di conformità per punteggio tecnico incrementale.</span>
                </div>
              </label>
            </div>

            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <span class="font-mono font-bold text-slate-300 uppercase block border-b border-slate-800 pb-2">File Busta Tecnica (.p7m)</span>
              <div class="space-y-2">
                ${(s3.busta_b_files || []).map((file, idx) => `
                  <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                    <span class="font-mono text-purple-300 text-[11px] truncate select-all">${file}</span>
                    <button onclick="navigator.clipboard.writeText('${file}'); showNotification('Nome file copiato!');" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px]">Copia Nome</button>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        <!-- TAB CONTENT: BUSTA C -->
        ${activeBusta === 'C' ? `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4">
              <span class="font-mono font-bold text-emerald-400 uppercase block border-b border-slate-800 pb-2">Calcolo Offerta Economica (Busta C)</span>
              
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-slate-400 font-semibold mb-1">Base d'Asta (€):</label>
                  <input type="text" readonly value="${formatEUR(s3.busta_c_base_amount || tender.amount)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono text-xs">
                </div>

                <div>
                  <label class="block text-slate-400 font-semibold mb-1">Ribasso Percentuale Offerto (%):</label>
                  <input id="w_discount_pct" type="number" step="0.01" value="${s3.busta_c_discount_pct || 5.5}" onchange="window.recalcBustaCEconomics()" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold text-xs focus:border-cyan-400">
                </div>
              </div>

              <div>
                <label class="block text-slate-400 font-semibold mb-1">Prezzo Netto Offerto (IVA esclusa):</label>
                <div class="flex gap-1.5">
                  <input id="w_offered_price" type="text" readonly value="${formatEUR(s3.busta_c_offered_price)}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold text-xs">
                  <button onclick="navigator.clipboard.writeText('${s3.busta_c_offered_price ? s3.busta_c_offered_price.toFixed(2) : '0'}'); showNotification('Prezzo netto copiato!');" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px]">Copia Cifra</button>
                </div>
              </div>

              <!-- Costi Manodopera ex art. 108 D.Lgs. 36/2023 -->
              <div class="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label class="block text-slate-400 font-semibold mb-1">Costi Manodopera (€) obbligatori:</label>
                  <input id="w_manodopera" type="number" value="${s3.busta_c_manodopera || 0}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs focus:border-cyan-400">
                </div>
                <div>
                  <label class="block text-slate-400 font-semibold mb-1">Oneri Sicurezza Aziendali (€):</label>
                  <input id="w_sicurezza" type="number" value="${s3.busta_c_sicurezza || 0}" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs focus:border-cyan-400">
                </div>
              </div>
            </div>

            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <span class="font-mono font-bold text-slate-300 uppercase block border-b border-slate-800 pb-2">File Offerta Economica MePA</span>
              <p class="text-[11px] text-slate-400">Genera l'offerta economica dal portale o compila il modello PDF Consip, poi firma digitalmente:</p>
              
              <div class="space-y-2">
                ${(s3.busta_c_files || []).map((file, idx) => `
                  <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                    <span class="font-mono text-emerald-300 text-[11px] truncate select-all">${file}</span>
                    <button onclick="navigator.clipboard.writeText('${file}'); showNotification('Nome file economico copiato!');" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px]">Copia Nome</button>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  if (currentWizardStep === 4) {
    const s4 = d.step4_data;
    return `
      <div class="space-y-4">
        <div class="border-b border-slate-800 pb-3 flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>Fase 4: Esito, Aggiudicazione &amp; Svincolo Polizze</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">POST-GARA</span>
            </h3>
            <p class="text-xs text-slate-400">Tracciamento della graduatoria ufficiale e richiesta di svincolo della cauzione provvisoria.</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4">
            <span class="text-xs font-mono font-bold text-slate-300 block uppercase border-b border-slate-800 pb-2">Registrazione Esito Gara</span>

            <div>
              <label class="block text-slate-400 font-semibold mb-1">Stato Aggiudicazione:</label>
              <select id="w_outcome" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-bold text-xs focus:border-cyan-400">
                <option value="Vinta" ${s4.outcome === 'Vinta' ? 'selected' : ''}>🏆 Gara Vinta (Aggiudicazione definitiva)</option>
                <option value="Persa" ${s4.outcome === 'Persa' ? 'selected' : ''}>❌ Gara Non Aggiudicata (Secondi classificati o scartati)</option>
                <option value="In Valutazione" ${s4.outcome === 'In Valutazione' ? 'selected' : ''}>⏳ In attesa di seduta pubblica o verifica anomalia</option>
              </select>
            </div>

            <label class="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-slate-800">
              <input id="w_fideiussione_svincolata" type="checkbox" ${s4.fideiussione_svincolata ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-cyan-500 mt-0.5">
              <div>
                <strong class="text-slate-200 block">Lettera di Svincolo Cauzione Provvisoria Inviata</strong>
                <span class="text-[11px] text-slate-400">Liberato il massimale presso l'istituto bancario o assicurativo garante.</span>
              </div>
            </label>
          </div>

          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <span class="text-xs font-mono font-bold text-slate-300 block uppercase border-b border-slate-800 pb-2">Archivio &amp; Verbale di Gara</span>

            <div>
              <label class="block text-slate-400 font-semibold mb-1">Note sull'Aggiudicazione / Graduatoria:</label>
              <textarea id="w_step4_notes" rows="4" placeholder="Dati dell'aggiudicatario, punteggio tecnico/economico conseguito..." class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:border-cyan-400">${escapeHtml(s4.note_conclusive || '')}</textarea>
            </div>
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

  // Modal injector
  let modal = document.getElementById("agentExportModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "agentExportModal";
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2">
          <span class="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">🤖</span>
          <div>
            <h3 class="text-sm font-bold text-white">Payload per Agente Autonomo (Browser-Use)</h3>
            <p class="text-[11px] text-slate-400 font-mono">Formato JSON strutturato pronto per esecuzione o automazione web</p>
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
