/**
 * MePA & Consip Desk Pro - Guida Metodologica & Strumenti Operativi
 * Modulo per il calcolo termini procedurali (D.Lgs. 36/2023), calcolo cauzione provvisoria (art. 106),
 * checklist interattiva 3 buste anti-esclusione e repository modelli legali.
 */

// Tab attiva all'interno della guida
let currentGuidaTab = 'fasi';

/**
 * Inizializza o aggiorna la vista Guida Metodologica
 */
window.loadGuida = function() {
  updateGuidaSemaforoStats();
  populateGuidaTenderSelect();
  renderGuidaCauzione();
  renderGuidaChecklist();
};

/**
 * Switch tra le tab della Guida Metodologica
 */
window.switchGuidaTab = function(tabId) {
  currentGuidaTab = tabId;
  const tabs = ['fasi', 'calcolatori', 'checklist', 'modelli'];
  
  tabs.forEach(t => {
    const btn = document.getElementById('tabBtnGuida-' + t);
    const pane = document.getElementById('tabPaneGuida-' + t);
    if (btn) {
      if (t === tabId) {
        btn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm';
      } else {
        btn.className = 'px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition flex items-center gap-2 border border-transparent';
      }
    }
    if (pane) {
      if (t === tabId) pane.classList.remove('hidden');
      else pane.classList.add('hidden');
    }
  });

  if (tabId === 'calcolatori') {
    populateGuidaTenderSelect();
  }
};

/**
 * Aggiorna i contatori reali del semaforo scadenze dalle gare salvate in SQLite
 */
function updateGuidaSemaforoStats() {
  const badgeRed = document.getElementById('guidaStatRed');
  const badgeYellow = document.getElementById('guidaStatYellow');
  const badgeGreen = document.getElementById('guidaStatGreen');
  if (!badgeRed || !badgeYellow || !badgeGreen) return;

  let all = [];
  if (typeof getAllTendersFromSQLite === 'function') {
    all = getAllTendersFromSQLite();
  }

  // Consideriamo solo le gare attive
  const active = all.filter(t => !['Vinta', 'Persa', 'Scartata'].includes(t.status));
  let redCount = 0;
  let yellowCount = 0;
  let greenCount = 0;

  active.forEach(t => {
    if (!t.deadline) return;
    const rem = calculateTimeRemaining(t.deadline);
    if (rem.days < 0) {
      // Scaduta
    } else if (rem.days <= 3) {
      redCount++;
    } else if (rem.days <= 7) {
      yellowCount++;
    } else {
      greenCount++;
    }
  });

  badgeRed.textContent = `${redCount} ${redCount === 1 ? 'gara' : 'gare'}`;
  badgeYellow.textContent = `${yellowCount} ${yellowCount === 1 ? 'gara' : 'gare'}`;
  badgeGreen.textContent = `${greenCount} ${greenCount === 1 ? 'gara' : 'gare'}`;
}

/**
 * Popola la tendina per selezionare una gara salvata nel calcolatore termini
 */
function populateGuidaTenderSelect() {
  const select = document.getElementById('calcTenderSelect');
  if (!select) return;

  let all = [];
  if (typeof getAllTendersFromSQLite === 'function') {
    all = getAllTendersFromSQLite();
  }

  const active = all.filter(t => !['Vinta', 'Persa', 'Scartata'].includes(t.status));
  const currentVal = select.value;

  select.innerHTML = `<option value="">-- Seleziona una gara salvata per caricare data e importo --</option>` +
    active.map(t => {
      const cigStr = t.cig ? `[${escapeHtml(t.cig)}] ` : '';
      const titleShort = (t.title || 'Senza titolo').substring(0, 45);
      return `<option value="${escapeHtml(t.id)}">${cigStr}${escapeHtml(titleShort)}...</option>`;
    }).join('');

  if (currentVal) select.value = currentVal;
}

/**
 * Carica i dati della gara selezionata nei due calcolatori
 */
window.handleGuidaTenderSelect = function(tenderId) {
  if (!tenderId) return;
  let all = [];
  if (typeof getAllTendersFromSQLite === 'function') {
    all = getAllTendersFromSQLite();
  }
  const tender = all.find(t => t.id === tenderId);
  if (!tender) return;

  // Carica nel calcolatore scadenze
  const inputDeadline = document.getElementById('calcInputDeadline');
  if (inputDeadline && tender.deadline) {
    // Normalizza ISO per datetime-local (YYYY-MM-DDTHH:mm)
    try {
      const d = new Date(tender.deadline);
      if (!isNaN(d.getTime())) {
        const pad = n => String(n).padStart(2, '0');
        const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        inputDeadline.value = formatted;
      }
    } catch (e) {
      inputDeadline.value = tender.deadline.substring(0, 16);
    }
    calculateGuidaDeadlines();
  }

  // Carica nel calcolatore cauzione
  const inputAmount = document.getElementById('calcInputAmount');
  if (inputAmount && tender.amount) {
    inputAmount.value = tender.amount;
    renderGuidaCauzione();
  }

  if (typeof showNotification === 'function') {
    showNotification(`Dati caricati per CIG ${tender.cig || tender.id}: Scadenza e Importo pronti`);
  }
};

/**
 * Calcola i termini procedurali in tempo reale
 */
window.calculateGuidaDeadlines = function() {
  const inputDeadline = document.getElementById('calcInputDeadline');
  const inputQaDays = document.getElementById('calcInputQaDays');
  const resultBox = document.getElementById('calcDeadlinesResult');
  if (!inputDeadline || !resultBox) return;

  const val = inputDeadline.value;
  if (!val) {
    resultBox.innerHTML = `
      <div class="p-6 rounded-2xl bg-slate-950/70 border border-slate-800 text-center text-xs text-slate-400 font-mono">
        Inserisci la data e l'ora di scadenza dell'offerta per calcolare i termini di legge D.Lgs. 36/2023.
      </div>
    `;
    return;
  }

  const deadlineDate = new Date(val);
  if (isNaN(deadlineDate.getTime())) {
    resultBox.innerHTML = `<div class="p-4 rounded-xl bg-rose-950/40 text-rose-300 border border-rose-800 text-xs font-mono">Data scadenza non valida.</div>`;
    return;
  }

  const qaDaysBefore = parseInt(inputQaDays ? inputQaDays.value : '10', 10) || 10;
  
  // Termine chiarimenti (Q&A per le imprese)
  const qaDate = new Date(deadlineDate.getTime() - (qaDaysBefore * 24 * 60 * 60 * 1000));
  // Termine risposte stazione appaltante (almeno 6 giorni prima ex art. 92 c.2)
  const saReplyDate = new Date(deadlineDate.getTime() - (6 * 24 * 60 * 60 * 1000));

  const now = new Date();
  const diffDays = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const diffHours = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60));

  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  let semaforoBadge = '';
  if (diffDays < 0) {
    semaforoBadge = `<span class="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 font-mono text-xs font-bold border border-slate-700">⚫ GARA SCADUTA</span>`;
  } else if (diffDays <= 3) {
    semaforoBadge = `<span class="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 font-mono text-xs font-bold border border-rose-500/30 animate-pulse">🔴 EMERGENZA (&le; 3 GIORNI)</span>`;
  } else if (diffDays <= 7) {
    semaforoBadge = `<span class="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-mono text-xs font-bold border border-amber-500/30">🟡 IN LAVORAZIONE (4-7 GIORNI)</span>`;
  } else {
    semaforoBadge = `<span class="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30">🟢 TEMPO CONGRUO (&gt; 7 GIORNI)</span>`;
  }

  const isQaExpired = qaDate.getTime() < now.getTime();

  resultBox.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
        <div class="space-y-0.5">
          <div class="text-[11px] font-mono text-slate-400 uppercase">Stato Semaforo &amp; Tempo Residuo:</div>
          <div class="text-sm font-bold text-white">${diffDays > 0 ? `${diffDays} giorni rimasti (~${diffHours} ore)` : 'Termine scaduto'}</div>
        </div>
        <div>${semaforoBadge}</div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <!-- Card 1: Termine Chiarimenti -->
        <div class="p-3.5 rounded-xl bg-slate-900 border ${isQaExpired ? 'border-rose-800/80 bg-rose-950/20' : 'border-sky-500/40'} space-y-1.5">
          <div class="flex items-center justify-between text-[10px] font-mono font-bold uppercase ${isQaExpired ? 'text-rose-400' : 'text-sky-400'}">
            <span>Termine Domande (Q&amp;A)</span>
            <span>Art. 92 c.2</span>
          </div>
          <div class="text-sm font-mono font-bold text-white">${fmt(qaDate)}</div>
          <div class="text-[10px] ${isQaExpired ? 'text-rose-300 font-semibold' : 'text-slate-400'}">
            ${isQaExpired ? '⚠️ Termine perentorio quesiti superato' : `Inviare quesiti entro ${qaDaysBefore} giorni prima`}
          </div>
        </div>

        <!-- Card 2: Termine Risposte Stazione Appaltante -->
        <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
          <div class="flex items-center justify-between text-[10px] font-mono font-bold uppercase text-amber-400">
            <span>Risposte Stazione Appaltante</span>
            <span>Min. 6gg prima</span>
          </div>
          <div class="text-sm font-mono font-bold text-white">${fmt(saReplyDate)}</div>
          <div class="text-[10px] text-slate-400">
            Obbligo di pubblicazione chiarimenti sul portale MePA
          </div>
        </div>

        <!-- Card 3: Termine Presentazione Offerta -->
        <div class="p-3.5 rounded-xl bg-slate-900 border border-purple-500/40 space-y-1.5">
          <div class="flex items-center justify-between text-[10px] font-mono font-bold uppercase text-purple-400">
            <span>Chiusura Piattaforma</span>
            <span>Termine Perentorio</span>
          </div>
          <div class="text-sm font-mono font-bold text-white">${fmt(deadlineDate)}</div>
          <div class="text-[10px] text-slate-400">
            Caricare e firmare Buste A, B e C entro l'orario indicato
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/90 text-xs">
        <span class="text-slate-300">Hai dubbi sul bando o sulle clausole del disciplinare?</span>
        <button onclick="window.switchGuidaTab('modelli')" class="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 font-semibold text-xs transition flex items-center gap-1.5">
          <span>Vai ai Modelli di Chiarimento RUP &rarr;</span>
        </button>
      </div>
    </div>
  `;
};

/**
 * Calcola l'importo della Cauzione Provvisoria (Art. 106 D.Lgs. 36/2023)
 */
window.renderGuidaCauzione = function() {
  const inputAmount = document.getElementById('calcInputAmount');
  const selectRate = document.getElementById('calcSelectRate');
  const chkPmi = document.getElementById('chkCauzionePmi');
  const chkIso9001 = document.getElementById('chkCauzioneIso9001');
  const chkIso14001 = document.getElementById('chkCauzioneIso14001');
  const chkParita = document.getElementById('chkCauzioneParita');
  const chkRating = document.getElementById('chkCauzioneRating');
  const outBox = document.getElementById('calcCauzioneResult');
  if (!outBox) return;

  const baseAmount = parseFloat(inputAmount ? inputAmount.value : '0') || 0;
  const ratePercent = parseFloat(selectRate ? selectRate.value : '2') || 2;

  if (baseAmount <= 0) {
    outBox.innerHTML = `
      <div class="p-6 rounded-2xl bg-slate-950/70 border border-slate-800 text-center text-xs text-slate-400 font-mono">
        Inserisci l'importo a base d'asta per calcolare la garanzia provvisoria e le riduzioni di legge.
      </div>
    `;
    return;
  }

  // Importo pieno al 2% o 1%
  const fullDeposit = (baseAmount * ratePercent) / 100;

  // Riduzioni secondo art. 106 comma 8 D.Lgs. 36/2023
  // Le riduzioni sono cumulabili applicandosi a cascata oppure in somma ponderata secondo prassi ANAC
  // Calcolo conforme:
  // 1. PMI: -50%
  // 2. ISO 9001: -30% (cumulabile con PMI)
  // 3. Ambientale / Parità di genere: ulteriori riduzioni
  let multiplier = 1.0;
  const appliedDiscounts = [];

  if (chkPmi && chkPmi.checked) {
    multiplier *= 0.50;
    appliedDiscounts.push({ name: 'Micro, Piccola o Media Impresa (PMI)', discount: '50%', note: 'Art. 106 c.8' });
  }
  if (chkIso9001 && chkIso9001.checked) {
    multiplier *= 0.70;
    appliedDiscounts.push({ name: 'Certificazione Qualità UNI EN ISO 9001', discount: '30%', note: 'Art. 106 c.8' });
  }
  if (chkIso14001 && chkIso14001.checked) {
    multiplier *= 0.80;
    appliedDiscounts.push({ name: 'Gestione Ambientale UNI EN ISO 14001 / EMAS', discount: '20%', note: 'Art. 106 c.8' });
  }
  if (chkParita && chkParita.checked) {
    multiplier *= 0.80;
    appliedDiscounts.push({ name: 'Certificazione Parità di Genere UNI/PdR 125', discount: '20%', note: 'Art. 106 c.8' });
  }
  if (chkRating && chkRating.checked) {
    multiplier *= 0.90;
    appliedDiscounts.push({ name: 'Rating di Legalità (AGCM)', discount: '10%', note: 'Art. 106 c.8' });
  }

  // Il Codice fissa un limite massimo di abbattimento complessivo non inferiore al 20% della cauzione iniziale
  const minDepositFloor = fullDeposit * 0.20;
  let finalDeposit = fullDeposit * multiplier;
  let isCapped = false;
  if (finalDeposit < minDepositFloor) {
    finalDeposit = minDepositFloor;
    isCapped = true;
  }

  const savedAmount = fullDeposit - finalDeposit;
  const effectiveReductionPercent = ((savedAmount / fullDeposit) * 100).toFixed(1);

  const fmtEur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

  outBox.innerHTML = `
    <div class="space-y-4">
      <!-- Big Value Badge -->
      <div class="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 border border-indigo-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="text-[11px] font-mono text-indigo-300 font-bold uppercase tracking-wider">Garanzia Fideiussoria Netta da Presentare:</div>
          <div class="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-1">${fmtEur(finalDeposit)}</div>
          <div class="text-xs text-emerald-400 font-mono mt-0.5">
            Risparmio cumulato: <strong>${fmtEur(savedAmount)}</strong> (-${effectiveReductionPercent}%)
          </div>
        </div>
        <div class="sm:text-right text-xs font-mono text-slate-400 space-y-1">
          <div>Base d'asta: <strong class="text-slate-200">${fmtEur(baseAmount)}</strong></div>
          <div>Aliquota bando: <strong class="text-slate-200">${ratePercent}% (${fmtEur(fullDeposit)})</strong></div>
          ${isCapped ? '<div class="text-amber-400 text-[10px]">⚠️ Applicato tetto max riduzione (floor 20%)</div>' : ''}
        </div>
      </div>

      <!-- Applied Discounts Breakdown -->
      <div class="space-y-2">
        <div class="text-xs font-bold text-slate-300 uppercase font-mono">Dettaglio Riduzioni Applicate (Art. 106 D.Lgs. 36/2023):</div>
        ${appliedDiscounts.length === 0 ? `
          <div class="text-xs text-slate-500 font-mono italic p-3 rounded-xl bg-slate-950 border border-slate-800">
            Nessuna riduzione selezionata. Seleziona almeno il flag PMI o ISO 9001 per ridurre l'esposizione bancaria.
          </div>
        ` : `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${appliedDiscounts.map(d => `
              <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center justify-between">
                <span class="text-slate-200 font-medium">${d.name}</span>
                <span class="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">-${d.discount}</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Legal note clause -->
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 leading-relaxed space-y-1">
        <strong class="text-slate-300 font-semibold block">Formula da inserire nell'offerta / polizza:</strong>
        <p class="font-mono text-[10px] text-indigo-300 bg-slate-900 p-2 rounded border border-slate-800 select-all">
          "Ai sensi dell'art. 106, comma 8, del D.Lgs. 36/2023, l'importo della garanzia provvisoria è ridotto a ${fmtEur(finalDeposit)} in virtù del possesso di: ${appliedDiscounts.map(d => d.name).join(', ') || 'nessun beneficio'}."
        </p>
      </div>
    </div>
  `;
};

/**
 * Gestione Checklist Interattiva 3 Buste
 */
const checklistState = {
  bustaA: [false, false, false, false, false, false],
  bustaB: [false, false, false],
  bustaC: [false, false, false]
};

window.toggleChecklistItem = function(busta, index) {
  if (!checklistState[busta]) return;
  checklistState[busta][index] = !checklistState[busta][index];
  renderGuidaChecklist();
};

window.resetGuidaChecklist = function() {
  Object.keys(checklistState).forEach(k => {
    checklistState[k] = checklistState[k].map(() => false);
  });
  renderGuidaChecklist();
  if (typeof showNotification === 'function') {
    showNotification('Checklist 3 Buste azzerata');
  }
};

function renderGuidaChecklist() {
  const container = document.getElementById('guidaChecklistContainer');
  const progressPercentEl = document.getElementById('guidaChecklistProgressPercent');
  const progressBarEl = document.getElementById('guidaChecklistProgressBar');
  if (!container) return;

  const totalItems = checklistState.bustaA.length + checklistState.bustaB.length + checklistState.bustaC.length;
  let checkedCount = 0;
  Object.values(checklistState).forEach(arr => {
    checkedCount += arr.filter(Boolean).length;
  });
  const percent = Math.round((checkedCount / totalItems) * 100);

  if (progressPercentEl) progressPercentEl.textContent = `${percent}% (${checkedCount}/${totalItems})`;
  if (progressBarEl) progressBarEl.style.width = `${percent}%`;

  const itemsA = [
    { title: "Domanda di partecipazione e dichiarazioni integrative", desc: "Firmata digitalmente (.p7m) in formato CAdES dal legale rappresentante o procuratore." },
    { title: "DGUE elettronico (o modello conforme)", desc: "Compilato in tutte le parti pertinenti con assenza di cause ostative ex artt. 94-95 D.Lgs. 36/2023." },
    { title: "Garanzia fideiussoria provvisoria (Art. 106)", desc: "Rilasciata da banca o compagnia autorizzata IVASS con rinuncia alla preventiva escussione e operatività a prima richiesta entro 15gg." },
    { title: "Impegno del fideiussore alla garanzia definitiva", desc: "Clausola esplicita del garante a rilasciare la cauzione definitiva in caso di aggiudicazione." },
    { title: "Ricevuta pagamento contributo ANAC", desc: "Scaricata dal portale Gestione Contributi Gara se l'importo della gara è superiore a 150.000 €." },
    { title: "Patto di Integrità e Codice di Comportamento", desc: "Documenti approvati dalla Stazione Appaltante sottoscritti per accettazione incondizionata." }
  ];

  const itemsB = [
    { title: "Relazione Tecnica / Progetto", desc: "Redatta nel rispetto rigoroso dei limiti di pagine, font e formattazione previsti dal disciplinare." },
    { title: "Schede Tecniche di prodotto / Certificazioni CAM", desc: "Rispondenza puntuale ai Criteri Ambientali Minimi e specifiche prestazionali richieste dal capitolato." },
    { title: "🚨 VERIFICA CRITICA: Assenza categorica di prezzi", desc: "La Busta B non deve contenere ALCUN elemento economico, ribasso o valore in euro. Pena ESCLUSIONE IMMEDIATA non sanabile!", isAlert: true }
  ];

  const itemsC = [
    { title: "Modello di Offerta Economica", desc: "Indicazione chiara della percentuale di ribasso offerta e del prezzo complessivo al netto di IVA." },
    { title: "Stima Oneri della Sicurezza Aziendali e Costi Manodopera", desc: "Dichiarazione obbligatoria ex art. 108 c.9 D.Lgs. 36/2023 a pena di soccorso istruttorio o esclusione." },
    { title: "Firma Digitale CAdES (.p7m)", desc: "Verificare che il certificato di firma digitale sia valido, non scaduto e non revocato alla data di trasmissione." }
  ];

  function renderGroup(groupKey, title, badgeColor, items) {
    return `
      <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <span class="text-xs font-mono font-bold ${badgeColor} uppercase tracking-wider">${title}</span>
          <span class="text-[11px] font-mono text-slate-400">
            ${checklistState[groupKey].filter(Boolean).length}/${items.length} verificati
          </span>
        </div>
        <div class="space-y-2.5">
          ${items.map((it, idx) => {
            const checked = checklistState[groupKey][idx];
            return `
              <label class="flex items-start gap-3 p-2.5 rounded-xl ${checked ? 'bg-emerald-950/20 border border-emerald-500/30' : it.isAlert ? 'bg-rose-950/20 border border-rose-500/30' : 'bg-slate-900/60 border border-slate-800/80'} hover:border-cyan-500/40 transition cursor-pointer">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleChecklistItem('${groupKey}', ${idx})" class="mt-0.5 w-4 h-4 rounded text-cyan-500 bg-slate-950 border-slate-700 focus:ring-cyan-400 focus:ring-offset-0">
                <div class="space-y-0.5 text-xs">
                  <div class="font-semibold ${checked ? 'text-emerald-300 line-through' : it.isAlert ? 'text-rose-400 font-bold' : 'text-slate-200'}">${it.title}</div>
                  <div class="text-[11px] ${it.isAlert ? 'text-rose-300/80' : 'text-slate-400'} leading-relaxed">${it.desc}</div>
                </div>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      ${renderGroup('bustaA', 'Busta A: Documentazione Amministrativa', 'text-sky-400', itemsA)}
      ${renderGroup('bustaB', 'Busta B: Offerta Tecnica', 'text-amber-400', itemsB)}
      ${renderGroup('bustaC', 'Busta C: Offerta Economica', 'text-purple-400', itemsC)}
    </div>
  `;
}

/**
 * Gestione Modelli Legali & Anteprima / Download
 */
window.previewLegalTemplate = function(templateType) {
  if (typeof LegalTemplates === 'undefined') {
    showNotification("Modulo LegalTemplates non ancora caricato.", "error");
    return;
  }

  const modal = document.getElementById('guidaTemplateModal');
  const modalTitle = document.getElementById('guidaTemplateModalTitle');
  const modalContent = document.getElementById('guidaTemplateModalContent');
  if (!modal || !modalTitle || !modalContent) return;

  let text = "";
  let title = "";

  const dummyParams = {
    cig: "B39FA14C80",
    authority: "MINISTERO DELLE INFRASTRUTTURE E DEI TRASPORTI",
    rup: "Ing. Mario Rossi",
    title: "AFFIDAMENTO FORNITURA HARDWARE, SERVER E ASSISTENZA MEPA",
    deadline: new Date(Date.now() + 10 * 86400000).toISOString(),
    qa_deadline: new Date(Date.now() + 5 * 86400000).toISOString(),
    companyName: "ACME INFORMATICA S.R.L.",
    piva: "01234567890",
    legalRep: "Dott. Giuseppe Verdi",
    question: "Si richiede conferma in merito alla possibilità di comprovare il requisito di fatturato specifico mediante contratti analoghi stipulati con enti pubblici e privati negli ultimi 36 mesi."
  };

  if (templateType === 'qa') {
    title = "Istanza di Chiarimento (Q&A ex art. 92 c.2 D.Lgs. 36/2023)";
    text = LegalTemplates.generateQaRequestText ? LegalTemplates.generateQaRequestText(dummyParams) : "Template non disponibile.";
  } else if (templateType === 'soccorso') {
    title = "Riscontro a Soccorso Istruttorio (Art. 101 D.Lgs. 36/2023)";
    text = LegalTemplates.generateSoccorsoIstruttorioText ? LegalTemplates.generateSoccorsoIstruttorioText(dummyParams) : "Template non disponibile.";
  } else if (templateType === 'svincolo') {
    title = "Richiesta Svincolo Cauzione Provvisoria (Art. 106 c.9 D.Lgs. 36/2023)";
    text = LegalTemplates.generateSvincoloGaranziaText ? LegalTemplates.generateSvincoloGaranziaText(dummyParams) : "Template non disponibile.";
  } else if (templateType === 'accesso') {
    title = "Istanza di Accesso agli Atti di Gara (Artt. 35-36 D.Lgs. 36/2023)";
    text = LegalTemplates.generateAccessoAttiText ? LegalTemplates.generateAccessoAttiText(dummyParams) : "Template non disponibile.";
  }

  modalTitle.textContent = title;
  modalContent.value = text;
  modal.classList.remove('hidden');
};

window.copyGuidaModalTemplate = function() {
  const modalContent = document.getElementById('guidaTemplateModalContent');
  if (!modalContent) return;
  modalContent.select();
  document.execCommand('copy');
  showNotification('Testo del modello legale copiato negli appunti!');
};

window.downloadGuidaModalTemplate = function() {
  const modalTitle = document.getElementById('guidaTemplateModalTitle');
  const modalContent = document.getElementById('guidaTemplateModalContent');
  if (!modalContent) return;

  const filename = (modalTitle ? modalTitle.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'modello_legale') + '.txt';
  const blob = new Blob([modalContent.value], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showNotification(`File ${filename} scaricato.`);
};

window.closeGuidaTemplateModal = function() {
  const modal = document.getElementById('guidaTemplateModal');
  if (modal) modal.classList.add('hidden');
};
