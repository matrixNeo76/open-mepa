/**
 * MePA & Consip Desk Pro - Market Intelligence & Executive Cockpit Controller
 * Aggregazioni di spesa pubblica, finestre di scadenza a semaforo, soglie D.Lgs. 36/2023,
 * strumenti negoziali MePA/Consip e funnel di conversione del dossier di gara.
 * Conforme alle specifiche di accessibilità WCAG 2.1 AA, numeri tabellari e zero dipendenze pesanti.
 */

let lastAnalyticsData = null;

/**
 * Caricamento asincrono e calcolo dei KPI di mercato (con fallback offline su SQLite Wasm)
 */
async function loadAnalytics() {
  try {
    const origin = (typeof liveBackendUrl !== "undefined" && liveBackendUrl) || 
                   (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8050");
    
    let d = null;
    try {
      const resp = await fetch(`${origin}/api/analytics`);
      if (resp.ok) {
        d = await resp.json();
      }
    } catch (netErr) {
      console.warn("Backend HTTP non raggiungibile per analytics, calcolo fallback da SQLite locale:", netErr);
    }

    // Se il server non risponde, calcola le metriche in memoria da SQLite locale
    if (!d) {
      d = computeLocalAnalytics();
    }

    lastAnalyticsData = d;
    renderAnalyticsDashboard(d);

  } catch (e) {
    console.error("Errore elaborazione analytics:", e);
    if (typeof window.showNotification === "function") {
      window.showNotification("Impossibile aggiornare le statistiche di mercato.", false);
    }
  }
}

/**
 * Calcolo deterministico delle metriche direttamente dal database locale SQLite
 */
function computeLocalAnalytics() {
  const all = (typeof getAllTendersFromSQLite === "function") 
    ? getAllTendersFromSQLite() 
    : (window.allTenders || window.fallbackTenders || []);

  const totalTenders = all.length;
  let totalAmount = 0;
  let activeTenders = 0;
  let activeAmount = 0;

  const now = Date.now();
  const plus7d = now + 7 * 86400000;
  const plus15d = now + 15 * 86400000;
  const plus30d = now + 30 * 86400000;

  let urgent7d = 0, urgent7dAmount = 0;
  let medium15d = 0, medium15dAmount = 0;
  let plan30d = 0, plan30dAmount = 0;
  let future30d = 0, future30dAmount = 0;
  let expiredCount = 0;

  const soglie = {
    micro: { count: 0, amount: 0, label: "Micro-Affidamenti (< €40k)", desc: "Affidamento diretto senza gara ex D.Lgs. 36/2023" },
    sotto_soglia: { count: 0, amount: 0, label: "Sotto-Soglia MePA (€40k - €143k)", desc: "RdO e procedure negoziate semplificate" },
    media_soglia: { count: 0, amount: 0, label: "Fascia Media (€143k - €500k)", desc: "Procedure ordinarie o negoziate con invito" },
    sopra_soglia: { count: 0, amount: 0, label: "Grandi Appalti / AQ (>= €500k)", desc: "Convenzioni nazionali e Accordi Quadro" }
  };

  const catMap = {};
  const instMap = {};
  const regMap = {};
  const statusMap = {};

  all.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    totalAmount += amt;

    // Verifica stato attivo
    let isActive = false;
    if (typeof window.isTenderActive === "function") {
      isActive = window.isTenderActive(t);
    } else {
      const isConcluded = ["Vinta", "Persa", "Scartata", "AGGIUDICATA", "DESERTA", "REVOCATA", "ANNULLATA"].includes(t.status);
      if (!isConcluded) {
        if (t.status === "Inviata") isActive = true;
        else if (t.deadline) {
          const dlTime = new Date(t.deadline).getTime();
          isActive = isNaN(dlTime) || dlTime >= now;
        }
      }
    }

    if (isActive) {
      activeTenders++;
      activeAmount += amt;

      // Scadenzario
      if (t.deadline) {
        const dlTime = new Date(t.deadline).getTime();
        if (!isNaN(dlTime)) {
          if (dlTime <= plus7d) {
            urgent7d++;
            urgent7dAmount += amt;
          } else if (dlTime <= plus15d) {
            medium15d++;
            medium15dAmount += amt;
          } else if (dlTime <= plus30d) {
            plan30d++;
            plan30dAmount += amt;
          } else {
            future30d++;
            future30dAmount += amt;
          }
        } else {
          future30d++;
          future30dAmount += amt;
        }
      } else {
        future30d++;
        future30dAmount += amt;
      }
    } else {
      expiredCount++;
    }

    // Soglie D.Lgs. 36/2023
    if (amt > 0 && amt < 40000) {
      soglie.micro.count++;
      soglie.micro.amount += amt;
    } else if (amt >= 40000 && amt < 143000) {
      soglie.sotto_soglia.count++;
      soglie.sotto_soglia.amount += amt;
    } else if (amt >= 143000 && amt < 500000) {
      soglie.media_soglia.count++;
      soglie.media_soglia.amount += amt;
    } else if (amt >= 500000) {
      soglie.sopra_soglia.count++;
      soglie.sopra_soglia.amount += amt;
    }

    // Categorie
    const cat = t.category || "ALTRO";
    if (!catMap[cat]) catMap[cat] = { category: cat, count: 0, amount: 0 };
    catMap[cat].count++;
    catMap[cat].amount += amt;

    // Strumenti
    const src = t.source || "Bandi e Gare";
    let instLabel = "Bandi Consip";
    if (src.includes("Convenzione")) instLabel = "Convenzioni Consip";
    else if (src.includes("Accordo")) instLabel = "Accordi Quadro";
    else if (src.includes("MePA") || src.includes("RdO")) instLabel = "RdO MePA";
    else if (src.includes("ASP")) instLabel = "Gare ASP";
    if (!instMap[instLabel]) instMap[instLabel] = { instrument: instLabel, count: 0, amount: 0 };
    instMap[instLabel].count++;
    instMap[instLabel].amount += amt;

    // Regioni
    const reg = t.region && t.region !== 'ND' ? t.region : "Nazionale";
    if (!regMap[reg]) regMap[reg] = { region: reg, count: 0, amount: 0 };
    regMap[reg].count++;
    regMap[reg].amount += amt;

    // Status
    const st = t.status || "Da Valutare";
    if (!statusMap[st]) statusMap[st] = { count: 0, amount: 0 };
    statusMap[st].count++;
    statusMap[st].amount += amt;
  });

  const categoriesBreakdown = Object.values(catMap).sort((a, b) => b.count - a.count);
  const instrumentsBreakdown = Object.values(instMap).sort((a, b) => b.count - a.count);
  const topRegionsGare = Object.values(regMap).sort((a, b) => b.count - a.count).slice(0, 5);

  const pipelineFunnel = [
    { phase: "1. Identificazione", status: "Da Valutare", count: statusMap["Da Valutare"]?.count || 0, amount: statusMap["Da Valutare"]?.amount || 0, color: "sky" },
    { phase: "2. In Lavorazione", status: "In Lavorazione", count: statusMap["In Lavorazione"]?.count || 0, amount: statusMap["In Lavorazione"]?.amount || 0, color: "amber" },
    { phase: "3. Offerte Inviate", status: "Inviata", count: statusMap["Inviata"]?.count || 0, amount: statusMap["Inviata"]?.amount || 0, color: "purple" },
    { phase: "4. Gare Vinte", status: "Vinta", count: statusMap["Vinta"]?.count || 0, amount: statusMap["Vinta"]?.amount || 0, color: "emerald" },
    { phase: "5. Concluse / Perse", status: "Concluse", count: (statusMap["Persa"]?.count || 0) + (statusMap["Scartata"]?.count || 0), amount: (statusMap["Persa"]?.amount || 0) + (statusMap["Scartata"]?.amount || 0), color: "slate" }
  ];

  return {
    total_tenders: totalTenders,
    total_amount: totalAmount,
    active_tenders: activeTenders,
    active_amount: activeAmount,
    average_ticket: activeTenders > 0 ? (activeAmount / activeTenders) : 0,
    deadline_breakdown: {
      urgent_7d: urgent7d, urgent_7d_amount: urgent7dAmount,
      medium_15d: medium15d, medium_15d_amount: medium15dAmount,
      plan_30d: plan30d, plan_30d_amount: plan30dAmount,
      future_30d: future30d, future_30d_amount: future30dAmount,
      expired_count: expiredCount
    },
    soglie_breakdown: [
      { key: "micro", ...soglie.micro },
      { key: "sotto_soglia", ...soglie.sotto_soglia },
      { key: "media_soglia", ...soglie.media_soglia },
      { key: "sopra_soglia", ...soglie.sopra_soglia }
    ],
    instruments_breakdown: instrumentsBreakdown,
    categories_breakdown: categoriesBreakdown,
    pipeline_funnel: pipelineFunnel,
    top_regions_gare: topRegionsGare,
    total_cataloghi: 287536,
    total_amministrazioni: 20776,
    top_regions_amm: [
      { regione: "LOMBARDIA", count: 3159 },
      { regione: "PIEMONTE", count: 2154 },
      { regione: "CAMPANIA", count: 1823 },
      { regione: "LAZIO", count: 1612 },
      { regione: "SICILIA", count: 1577 }
    ]
  };
}

/**
 * Rendering ad alta densità e leggibilità del cruscotto strategico
 */
function renderAnalyticsDashboard(d) {
  // Sottotitolo Dinamico
  const subEl = document.getElementById("anaHeaderSubtitle");
  if (subEl) {
    const act = (d.active_tenders || 0).toLocaleString('it-IT');
    const tot = (d.total_tenders || 0).toLocaleString('it-IT');
    subEl.textContent = `Analisi di mercato in tempo reale calcolate su ${act} procedure attive (${tot} bandi storici monitorati), suddivise per finestre di scadenza e strumenti d'acquisto MePA.`;
  }

  // 1. KPI Cards Superiori
  const actCountEl = document.getElementById("anaActiveCount");
  const totCountEl = document.getElementById("anaTendersCount");
  const actAmtEl = document.getElementById("anaActiveAmount");
  const avgTicketEl = document.getElementById("anaAvgTicket");
  const urgCountEl = document.getElementById("anaUrgentCount");
  const urgAmtEl = document.getElementById("anaUrgentAmount");
  const pipeCountEl = document.getElementById("anaPipelineActiveCount");
  const catCountEl = document.getElementById("anaCatalogCount");
  const ammCountEl = document.getElementById("anaAmmCount");

  if (actCountEl) actCountEl.textContent = (d.active_tenders || 0).toLocaleString('it-IT');
  if (totCountEl) totCountEl.textContent = (d.total_tenders || 0).toLocaleString('it-IT');
  if (actAmtEl) actAmtEl.textContent = formatCompactCurrency(d.active_amount || 0);
  if (avgTicketEl) avgTicketEl.textContent = formatCompactCurrency(d.average_ticket || 0);

  const dl = d.deadline_breakdown || {};
  if (urgCountEl) urgCountEl.textContent = (dl.urgent_7d || 0).toLocaleString('it-IT');
  if (urgAmtEl) urgAmtEl.textContent = formatCompactCurrency(dl.urgent_7d_amount || 0);

  // Calcola quante gare sono in lavorazione / valutazione nell'ufficio gare
  const pipe = d.pipeline_funnel || [];
  const inVal = pipe.find(p => p.status === "Da Valutare")?.count || 0;
  const inLav = pipe.find(p => p.status === "In Lavorazione")?.count || 0;
  const inInv = pipe.find(p => p.status === "Inviata")?.count || 0;
  const pipeActive = inLav + inInv;
  if (pipeCountEl) pipeCountEl.textContent = pipeActive > 0 ? pipeActive.toLocaleString('it-IT') : `${inVal.toLocaleString('it-IT')} da vagliare`;

  if (catCountEl) catCountEl.textContent = (d.total_cataloghi || 287536).toLocaleString('it-IT');
  if (ammCountEl) ammCountEl.textContent = (d.total_amministrazioni || 20776).toLocaleString('it-IT');

  // 2. Box 1: Scadenzario delle Opportunità (Finestre Temporali)
  const dlContainer = document.getElementById("anaDeadlinesBreakdown");
  if (dlContainer) {
    const totalActive = Math.max(d.active_tenders || 1, 1);
    const windows = [
      {
        badge: "URGENZA IMMEDIATA",
        title: "Entro 7 Giorni",
        subtitle: "Azione rapida per cauzione e DGUE",
        count: dl.urgent_7d || 0,
        amount: dl.urgent_7d_amount || 0,
        color: "rose",
        filterKey: "urgent_7d"
      },
      {
        badge: "TERMINE MEDIO",
        title: "Tra 7 e 15 Giorni",
        subtitle: "Fase ottimale di preparazione offerta",
        count: dl.medium_15d || 0,
        amount: dl.medium_15d_amount || 0,
        color: "amber",
        filterKey: "active"
      },
      {
        badge: "PIANIFICAZIONE ORDINARIA",
        title: "Tra 15 e 30 Giorni",
        subtitle: "Tempo congruo per offerta tecnica",
        count: dl.plan_30d || 0,
        amount: dl.plan_30d_amount || 0,
        color: "emerald",
        filterKey: "active"
      },
      {
        badge: "PIPELINE STRATEGICA",
        title: "Oltre 30 Giorni",
        subtitle: "Grandi appalti e convenzioni future",
        count: dl.future_30d || 0,
        amount: dl.future_30d_amount || 0,
        color: "sky",
        filterKey: "active"
      }
    ];

    dlContainer.innerHTML = windows.map(w => {
      const pct = Math.round((w.count / totalActive) * 100);
      return `
        <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition space-y-2">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-${w.color}-400"></span>
              <span class="font-bold text-white">${escapeHtml(w.title)}</span>
              <span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-${w.color}-500/10 text-${w.color}-300 border border-${w.color}-500/20">${w.badge}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-${w.color}-400 font-bold tabular-nums text-xs">${w.count.toLocaleString('it-IT')} bandi</span>
              <button type="button" onclick="window.analyticsFilter('deadline', '${w.filterKey}')" class="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 font-mono transition">
                Filtra &rarr;
              </button>
            </div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span>${w.subtitle}</span>
            <span class="font-mono text-slate-300 tabular-nums">${formatEUR(w.amount)} (${pct}%)</span>
          </div>
          <div class="h-1.5 rounded-full bg-slate-950 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full bg-${w.color}-500 rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('') + `
      <div class="pt-2 flex items-center justify-between text-xs text-slate-500 font-mono border-t border-slate-800/60">
        <span>Archivio Procedure Scadute / Concluse:</span>
        <span class="text-slate-400 font-bold">${(dl.expired_count || 0).toLocaleString('it-IT')} gare storiche</span>
      </div>
    `;
  }

  // 3. Box 2: Soglie D.Lgs. 36/2023 (Opportunità per PMI)
  const soglieContainer = document.getElementById("anaSoglieBreakdown");
  if (soglieContainer && d.soglie_breakdown) {
    const totalTenders = Math.max(d.total_tenders || 1, 1);
    soglieContainer.innerHTML = d.soglie_breakdown.map((s, idx) => {
      const pct = Math.round((s.count / totalTenders) * 100);
      const isSotto = s.key === "sotto_soglia" || s.key === "micro";
      const badgeColor = isSotto ? "emerald" : (s.key === "media_soglia" ? "cyan" : "indigo");

      return `
        <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition space-y-2">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="font-bold text-white">${escapeHtml(s.label)}</span>
              ${isSotto ? '<span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold">ACCESSO PMI RAPIDO</span>' : ''}
            </div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-${badgeColor}-400 font-bold tabular-nums">${s.count.toLocaleString('it-IT')} lotti</span>
              <button type="button" onclick="window.analyticsFilter('soglia', '${s.key}')" class="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 font-mono transition">
                Filtra &rarr;
              </button>
            </div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span class="truncate max-w-[260px]">${escapeHtml(s.desc)}</span>
            <span class="font-mono text-slate-300 tabular-nums">${formatCompactCurrency(s.amount)} (${pct}%)</span>
          </div>
          <div class="h-1.5 rounded-full bg-slate-950 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full bg-gradient-to-r from-${badgeColor}-500 to-blue-500 rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Box 3: Categorie Merceologiche MePA
  const catContainer = document.getElementById("anaCategoryBars");
  if (catContainer && d.categories_breakdown) {
    const maxAmount = Math.max(...d.categories_breakdown.map(c => c.amount), 1);
    catContainer.innerHTML = d.categories_breakdown.map(c => {
      const pct = Math.round((c.amount / maxAmount) * 100);
      return `
        <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5 hover:border-slate-700 transition">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="font-bold text-white">${escapeHtml(c.category)}</span>
              <span class="text-[10px] font-mono text-slate-400">(${c.count.toLocaleString('it-IT')} bandi)</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-emerald-400 font-bold tabular-nums text-xs">${formatCompactCurrency(c.amount)}</span>
              <button type="button" onclick="window.analyticsFilter('category', '${c.category}')" class="text-[10px] text-purple-300 hover:text-white px-2 py-0.5 rounded bg-purple-950/60 hover:bg-purple-900/80 border border-purple-800/60 font-mono transition">
                Vedi &rarr;
              </button>
            </div>
          </div>
          <div class="h-1.5 rounded-full bg-slate-950 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-500 rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Box 4: Strumenti Negoziali MePA & Consip
  const instContainer = document.getElementById("anaInstrumentsBreakdown");
  if (instContainer && d.instruments_breakdown) {
    const maxInst = Math.max(...d.instruments_breakdown.map(i => i.count), 1);
    instContainer.innerHTML = d.instruments_breakdown.map(inst => {
      const pct = Math.round((inst.count / maxInst) * 100);
      return `
        <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5 hover:border-slate-700 transition">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="font-bold text-white">${escapeHtml(inst.instrument)}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-sky-400 font-bold tabular-nums">${inst.count.toLocaleString('it-IT')} procedure</span>
              <button type="button" onclick="window.analyticsFilter('instrument', '${inst.instrument}')" class="text-[10px] text-sky-300 hover:text-white px-2 py-0.5 rounded bg-sky-950/60 hover:bg-sky-900/80 border border-sky-800/60 font-mono transition">
                Filtra &rarr;
              </button>
            </div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span>Basi d'asta complessive</span>
            <span class="font-mono text-slate-300 tabular-nums">${formatCompactCurrency(inst.amount)}</span>
          </div>
          <div class="h-1.5 rounded-full bg-slate-950 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full bg-gradient-to-r from-sky-500 to-blue-600 rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 6. Box 5: Top Regioni & Domanda della PA
  const regContainer = document.getElementById("anaRegionAmmBars");
  if (regContainer && d.top_regions_amm) {
    const maxAmm = Math.max(...d.top_regions_amm.map(r => r.count), 1);
    regContainer.innerHTML = d.top_regions_amm.map(r => {
      const pct = Math.round((r.count / maxAmm) * 100);
      return `
        <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5 hover:border-slate-700 transition">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="text-slate-400">📍</span>
              <span class="font-bold text-white">${escapeHtml(r.regione)}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-emerald-400 font-bold tabular-nums">${r.count.toLocaleString('it-IT')} stazioni PA</span>
              <button type="button" onclick="window.analyticsFilter('region', '${r.regione}')" class="text-[10px] text-emerald-300 hover:text-white px-2 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/60 font-mono transition">
                Gare &rarr;
              </button>
            </div>
          </div>
          <div class="h-1.5 rounded-full bg-slate-950 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 7. Box 6: Funnel Operativo 4 Fasi del Tuo Ufficio Gare
  const statusContainer = document.getElementById("anaStatusBars");
  if (statusContainer && d.pipeline_funnel) {
    const maxPipe = Math.max(...d.pipeline_funnel.map(p => p.count), 1);
    statusContainer.innerHTML = d.pipeline_funnel.map((p, idx) => {
      const pct = Math.round((p.count / maxPipe) * 100);
      const isHot = p.status === "In Lavorazione" || p.status === "Inviata" || p.status === "Vinta";

      return `
        <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5 hover:border-slate-700 transition">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-slate-400 text-[11px]">${idx + 1}.</span>
              <span class="font-bold text-white">${escapeHtml(p.phase)}</span>
              ${p.status === "Vinta" ? '<span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">AGGIUDICATE</span>' : ''}
            </div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-${p.color}-400 font-bold tabular-nums">${p.count.toLocaleString('it-IT')} gare</span>
              <button type="button" onclick="window.analyticsFilter('status', '${p.status}')" class="text-[10px] text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 font-mono transition">
                Visualizza &rarr;
              </button>
            </div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span>Valore del portafoglio di fase</span>
            <span class="font-mono text-slate-300 tabular-nums">${formatCompactCurrency(p.amount)}</span>
          </div>
          <div class="h-1.5 rounded-full bg-slate-950 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full bg-${p.color}-500 rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

/**
 * Format valuta compatto e leggibile (es: € 1,2 Mld, € 240k, € 45.000)
 */
function formatCompactCurrency(val) {
  const num = parseFloat(val) || 0;
  if (num >= 1000000000) {
    return `€ ${(num / 1000000000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Mld`;
  }
  if (num >= 1000000) {
    return `€ ${(num / 1000000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Mln`;
  }
  if (num >= 10000) {
    return `€ ${(num / 1000).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`;
  }
  return formatEUR(num);
}

/**
 * Filtro rapido e drill-down interattivo verso il Cruscotto Gare
 */
window.analyticsFilter = function(filterType, val) {
  if (typeof window.switchView === "function") {
    window.switchView("cruscotto");
  }

  setTimeout(() => {
    const filterCategory = document.getElementById("filterCategory");
    const filterRegion = document.getElementById("filterRegion");
    const filterSource = document.getElementById("filterSource");
    const filterStatus = document.getElementById("filterStatus");
    const searchInput = document.getElementById("searchInput");
    const sortTenders = document.getElementById("sortTenders");

    // Reset chip attivi
    document.querySelectorAll(".chip-ghost").forEach(c => c.classList.remove("active"));

    if (filterType === "attive") {
      if (filterStatus) filterStatus.value = "SOLO_ATTIVE";
      document.getElementById("chipActive")?.classList.add("active");
      if (typeof window.showNotification === "function") {
        window.showNotification("Filtro applicato: Mostrate solo le gare attive e aperte");
      }
    } else if (filterType === "urgent_7d") {
      if (filterStatus) filterStatus.value = "SOLO_ATTIVE";
      if (sortTenders) sortTenders.value = "deadline_asc";
      document.getElementById("chipActive")?.classList.add("active");
      if (typeof window.showNotification === "function") {
        window.showNotification("Filtro applicato: Gare urgenti in scadenza entro 7 giorni");
      }
    } else if (filterType === "category" && filterCategory) {
      filterCategory.value = val;
      if (val === "IT") document.getElementById("chipIT")?.classList.add("active");
      if (val === "CANCELLERIA") document.getElementById("chipPaper")?.classList.add("active");
      if (typeof window.showNotification === "function") {
        window.showNotification(`Filtro categoria: ${val}`);
      }
    } else if (filterType === "instrument" && filterSource) {
      if (val.includes("Convenzione")) filterSource.value = "Bandi e Gare";
      else if (val.includes("MePA") || val.includes("RdO")) filterSource.value = "RdO MePA";
      else filterSource.value = "ALL";
      if (typeof window.showNotification === "function") {
        window.showNotification(`Filtro strumento: ${val}`);
      }
    } else if (filterType === "region" && filterRegion) {
      filterRegion.value = val;
      if (typeof window.showNotification === "function") {
        window.showNotification(`Filtro regione territoriale: ${val}`);
      }
    } else if (filterType === "status" && filterStatus) {
      filterStatus.value = val === "Concluse" ? "SCADUTE" : val;
      if (typeof window.showNotification === "function") {
        window.showNotification(`Filtro fase pipeline: ${val}`);
      }
    } else if (filterType === "soglia") {
      if (filterStatus) filterStatus.value = "SOLO_ATTIVE";
      if (typeof window.showNotification === "function") {
        window.showNotification(`Filtro gare aperte per fascia d'importo: ${val}`);
      }
    }

    if (typeof window.filterTenders === "function") {
      window.filterTenders();
    }
  }, 100);
};

/**
 * Esportazione del Report Esecutivo di Mercato (CSV Excel con BOM o JSON)
 */
window.exportAnalyticsReport = function(format) {
  const origin = (typeof liveBackendUrl !== "undefined" && liveBackendUrl) || 
                 (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8050");
  
  if (format === "csv") {
    window.location.href = `${origin}/api/analytics/export?format=csv`;
    if (typeof window.showNotification === "function") {
      window.showNotification("Download Report Esecutivo di Mercato Excel (.csv) avviato!");
    }
  } else if (format === "json") {
    window.open(`${origin}/api/analytics/export?format=json`, "_blank");
    if (typeof window.showNotification === "function") {
      window.showNotification("Visualizzazione JSON Report Mercato");
    }
  }
};

/**
 * Modale di Guida e Spiegazione Semplice ("In parole povere")
 */
window.showAnalyticsHelpModal = function(topic) {
  let modal = document.getElementById("anaHelpModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "anaHelpModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.className = "fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) window.closeAnalyticsHelpModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) {
        window.closeAnalyticsHelpModal();
      }
    });
  }

  let title = "Guida al Cruscotto Statistiche & Market Intelligence";
  let content = "";

  if (topic === "soglie") {
    title = "Soglie del D.Lgs. 36/2023 (Opportunità per PMI)";
    content = `
      <div class="space-y-3 text-xs text-slate-300 leading-relaxed">
        <p>Il Nuovo Codice degli Appalti Pubblici (D.Lgs. 36/2023) introduce soglie economiche cruciali che stabiliscono <strong>come</strong> le PA possono acquistare:</p>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
          <div class="font-bold text-emerald-400">1. Sotto-Soglia MePA (&lt; 143.000 € per Servizi e Forniture)</div>
          <p class="text-slate-400">Le stazioni appaltanti possono procedere con <strong>affidamento diretto</strong> o <strong>procedura negoziata semplificata</strong> senza pubblicare un bando di gara europeo. Sono le gare più veloci e ad altissima percentuale di successo per le PMI.</p>
        </div>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
          <div class="font-bold text-cyan-400">2. Fascia Media (143.000 € – 500.000 €)</div>
          <p class="text-slate-400">Procedure negoziate con invito ad almeno 5 operatori economici o gare aperte. Richiedono cauzione provvisoria al 2% o 1% con certificazione di qualità ISO.</p>
        </div>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
          <div class="font-bold text-indigo-400">3. Sopra-Soglia Comunitaria (&ge; 500.000 € / Accordi Quadro)</div>
          <p class="text-slate-400">Grandi lotti multi-annuali Consip. Prevedono requisiti di fatturato specifico e garanzie fideiussorie importanti.</p>
        </div>
      </div>
    `;
  } else if (topic === "scadenze") {
    title = "Scadenzario Temporale e Finestre di Urgenza";
    content = `
      <div class="space-y-3 text-xs text-slate-300 leading-relaxed">
        <p>Nelle gare pubbliche il tempo è il fattore più critico. Non riuscire a trasmettere la busta anche per un solo minuto comporta l'<strong>esclusione automatica irreversibile</strong>.</p>
        <ul class="space-y-2 list-disc list-inside text-slate-400">
          <li><strong class="text-rose-400">&lt; 7 Giorni (Urgenza Immediata)</strong>: Partecipa solo se hai già pronta la cauzione provvisoria e la firma digitale CAdES (.p7m) del legale rappresentante.</li>
          <li><strong class="text-amber-400">7 – 15 Giorni</strong>: La finestra ideale per completare il DGUE elettronico e formulare quesiti (Q&A) alla Stazione Appaltante.</li>
          <li><strong class="text-emerald-400">15 – 30 Giorni</strong>: Consente di redigere una Relazione Tecnica dettagliata e ottenere il massimo punteggio nell'offerta tecnica.</li>
        </ul>
      </div>
    `;
  } else if (topic === "importo") {
    title = "Massa Economica Attiva vs Massimali Storici";
    content = `
      <div class="space-y-3 text-xs text-slate-300 leading-relaxed">
        <p>In precedenza la schermata sommava tutti gli importi storici arrivando a oltre 117 miliardi di euro, creando confusione.</p>
        <p>Il nuovo Cruscotto separa rigorosamente:</p>
        <ul class="space-y-1.5 list-disc list-inside text-slate-400">
          <li><strong>Massa Economica Attiva</strong>: Solo le gare che hanno ancora i termini di presentazione dell'offerta aperti.</li>
          <li><strong>Ticket Medio</strong>: Il valore medio stimato per singola procedura, indispensabile per capire la taglia finanziaria tipica delle gare aperte.</li>
        </ul>
      </div>
    `;
  } else if (topic === "pipeline") {
    title = "Il Funnel Operativo delle 4 Fasi del Dossier";
    content = `
      <div class="space-y-3 text-xs text-slate-300 leading-relaxed">
        <p>Il nostro gestionale struttura la partecipazione in <strong>4 Fasi sequenziali rigorose</strong> per azzerare gli errori di rito:</p>
        <ol class="space-y-2 list-decimal list-inside text-slate-400">
          <li><strong class="text-sky-300">Identificazione &amp; CIG</strong>: Verifica requisiti minimi e compatibilità con il catalogo aziendale.</li>
          <li><strong class="text-amber-300">Valutazione Go / No-Go</strong>: Calcolo dei margini e decisione se investire tempo nella gara.</li>
          <li><strong class="text-purple-300">Predisposizione 3 Buste</strong>: Busta A Amministrativa (DGUE, Fideiussione), Busta B Tecnica, Busta C Economica.</li>
          <li><strong class="text-emerald-300">Esito &amp; Aggiudicazione</strong>: Verifica graduatoria, soccorso istruttorio e stipula contratto.</li>
        </ol>
      </div>
    `;
  } else {
    content = `
      <div class="space-y-3 text-xs text-slate-300 leading-relaxed">
        <p>Questo cruscotto raccoglie i dati aggregati del database locale per darti una <strong>visione d'insieme commerciale</strong>:</p>
        <ul class="space-y-2 list-disc list-inside text-slate-400">
          <li>Quali settori merceologici offrono più gare aperte in questo momento.</li>
          <li>In quali regioni d'Italia la Pubblica Amministrazione acquista maggiormente.</li>
          <li>Quali sono le scadenze più urgenti a cui dare priorità oggi.</li>
        </ul>
        <p class="pt-2 text-slate-400">Cliccando sul pulsante <strong>"Filtra &rarr;"</strong> accanto a qualsiasi metrica puoi passare direttamente all'elenco delle gare corrispondenti nel Cruscotto Operativo.</p>
      </div>
    `;
  }

  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl relative text-left space-y-5" onclick="event.stopPropagation()">
      <div class="flex items-start justify-between gap-4 pb-3 border-b border-slate-800">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold">
            💡
          </div>
          <h3 class="text-sm font-bold text-white tracking-tight leading-snug">${escapeHtml(title)}</h3>
        </div>
        <button type="button" onclick="window.closeAnalyticsHelpModal()" class="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition" title="Chiudi finestra">
          ✕
        </button>
      </div>
      <div>
        ${content}
      </div>
      <div class="pt-2 border-t border-slate-800 flex justify-end">
        <button type="button" onclick="window.closeAnalyticsHelpModal()" class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition">
          Ho capito, grazie
        </button>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
};

/**
 * Chiusura modale guida
 */
window.closeAnalyticsHelpModal = function() {
  const modal = document.getElementById("anaHelpModal");
  if (modal) modal.classList.add("hidden");
};
