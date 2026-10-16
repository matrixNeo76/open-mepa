/**
 * MePA & Consip Desk Pro - Open Data & CKAN Hub Controller
 * Gestione integrata del catalogo dataset ufficiali dati.consip.it,
 * sincronizzazione con storage SQLite 3, Drag & Drop universale e streaming big data.
 */

window.loadOpenDataHub = async function() {
  const container = document.getElementById("view-opendata");
  if (!container) return;

  await refreshOpenDataStats();
  renderOpenDataCards();
  setupOpenDataDragAndDrop();
};

// Aggiorna metriche di sincronizzazione del database locale
async function refreshOpenDataStats() {
  let gareCount = 0;
  let negCount = 0;
  let bandiCount = 0;
  let catCount = 0;
  let ammCount = 0;
  let operCount = 0;
  let contrCount = 0;
  let storageEngine = "SQLite 3 Wasm";

  if (liveBackendConnected) {
    try {
      const resp = await Api.getStatus();
      gareCount = resp.total_tenders || 0;
      negCount = resp.total_negoziazioni || 0;
      bandiCount = resp.total_bandiegare || 0;
      catCount = resp.total_cataloghi || 0;
      ammCount = resp.total_amministrazioni || 0;
      operCount = resp.total_operatori || 0;
      contrCount = resp.total_contratti || 0;
      storageEngine = "SQLite 3 Live Server (Porta " + (window.location.port || "8050") + ")";
    } catch (e) {
      console.warn("Fallback su cache locale per statistiche Open Data:", e);
    }
  }

  // Fallback se disconnesso o valori nulli
  if (gareCount === 0 && typeof getAllTendersFromSQLite === "function") {
    const all = getAllTendersFromSQLite();
    gareCount = all.length;
    negCount = all.filter(t => {
      const s = (t.source || "").toLowerCase().trim();
      return s === "mepa" || s.startsWith("rdo") || s.includes("trattativa");
    }).length;
    bandiCount = Math.max(0, gareCount - negCount);
  } else if (negCount === 0 && bandiCount === 0 && typeof getAllTendersFromSQLite === "function") {
    const all = getAllTendersFromSQLite();
    negCount = all.filter(t => {
      const s = (t.source || "").toLowerCase().trim();
      return s === "mepa" || s.startsWith("rdo") || s.includes("trattativa");
    }).length;
    bandiCount = Math.max(0, (gareCount || all.length) - negCount);
  }

  // Aggiorna elementi DOM KPI
  const elGare = document.getElementById("kpiOpendataGare");
  const elCat = document.getElementById("kpiOpendataCat");
  const elAmm = document.getElementById("kpiOpendataAmm");
  const elStorage = document.getElementById("kpiOpendataStorage");

  if (elGare) elGare.textContent = Number(gareCount).toLocaleString("it-IT");
  if (elCat) elCat.textContent = Number(catCount).toLocaleString("it-IT");
  if (elAmm) elAmm.textContent = Number(ammCount).toLocaleString("it-IT");
  if (elStorage) elStorage.textContent = storageEngine;

  window._opendataStats = { 
    gare: gareCount, 
    negoziazioni: negCount,
    bandiegare: bandiCount,
    cat: catCount, 
    amm: ammCount, 
    oper: operCount, 
    contr: contrCount, 
    storage: storageEngine 
  };
}

// Renderizza le 6 card dei dataset ufficiali arricchite con tracciato record e stato sincro
function renderOpenDataCards() {
  const cardsContainer = document.getElementById("datasetCardsContainer");
  const selectYear = document.getElementById("selectDatasetYear");
  if (!cardsContainer) return;

  const year = selectYear ? selectYear.value : "2026";
  const stats = window._opendataStats || { gare: 1822, negoziazioni: 392, bandiegare: 1430, cat: 287536, amm: 20776, oper: 317026, contr: 0 };

  cardsContainer.innerHTML = consipDatasets.map(ds => {
    const ckanPage = ds.ckanUrl;
    const slug = typeof ds.fileSlug === "function" ? ds.fileSlug(year) : "";
    const csvDirectUrl = slug ? `https://dati.consip.it/download/dataset/${slug}.csv` : "";

    // Calcola stato di sincronizzazione locale
    let syncBadge = "";
    let syncDetail = "";

    if (ds.id === "negoziazioni") {
      const count = stats.negoziazioni !== undefined ? stats.negoziazioni : 392;
      syncBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
        <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> Attivo nel DB (${Number(count).toLocaleString("it-IT")} RdO MePA)
      </span>`;
      syncDetail = `Procedure negoziate (RdO, Trattative Dirette e Preventivi MePA) indicizzate per CIG.`;
    } else if (ds.id === "bandiegare") {
      const count = stats.bandiegare !== undefined ? stats.bandiegare : 1430;
      syncBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Attivo nel DB (${Number(count).toLocaleString("it-IT")} Bandi e Convenzioni)
      </span>`;
      syncDetail = `Accordi Quadro, Convenzioni Consip e Gare ASP centralizzate per conto di PA.`;
    } else if (ds.id === "amministrazioni") {
      syncBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
        <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span> Anagrafica attiva (${Number(stats.amm).toLocaleString("it-IT")} PA)
      </span>`;
      syncDetail = `Tabella <code class="text-sky-300 font-mono text-[11px]">amministrazioni</code> con Codici Fiscali e Punti Ordinanti.`;
    } else if (ds.id === "cataloghi") {
      syncBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-pink-500/10 text-pink-400 border border-pink-500/20">
        <span class="w-1.5 h-1.5 rounded-full bg-pink-400"></span> Listini caricati (${Number(stats.cat).toLocaleString("it-IT")} articoli)
      </span>`;
      syncDetail = `Storage stream ad alta efficienza <code class="text-pink-300 font-mono text-[11px]">cataloghi</code> (~600MB).`;
    } else if (ds.id === "operatorieconomici") {
      if (stats.oper > 0) {
        syncBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Attivo nel DB (${Number(stats.oper).toLocaleString("it-IT")} imprese)
        </span>`;
        syncDetail = `Albo fornitori memorizzato nella tabella <code class="text-purple-300 font-mono text-[11px]">operatori_economici</code>.`;
      } else {
        syncBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-purple-300 bg-purple-950/40 border border-purple-500/30">
          Disponibile &bull; Sincronizza 1-Click
        </span>`;
        syncDetail = `Pronto per l'ingestion in tabella <code class="text-purple-300 font-mono text-[11px]">operatori_economici</code>.`;
      }
    } else if (ds.id === "acquisti") {
      if (stats.contr > 0) {
        syncBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Attivo nel DB (${Number(stats.contr).toLocaleString("it-IT")} contratti)
        </span>`;
        syncDetail = `Storico aggiudicazioni nella tabella <code class="text-emerald-300 font-mono text-[11px]">contratti_stipulati</code>.`;
      } else {
        syncBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-emerald-300 bg-emerald-950/40 border border-emerald-500/30">
          Disponibile &bull; Sincronizza 1-Click
        </span>`;
        syncDetail = `Pronto per l'ingestion in tabella <code class="text-emerald-300 font-mono text-[11px]">contratti_stipulati</code>.`;
      }
    } else {
      syncBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800">
        Dataset Aperto &bull; Disponibile per Import
      </span>`;
      syncDetail = `Pronto per deduplicazione su storage SQLite con schema aperto.`;
    }

    const keyColsHtml = (ds.keyColumns || []).map(col => 
      `<span class="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 font-mono text-[10px]">${escapeHtml(col)}</span>`
    ).join(" ");

    return `
      <div class="bg-slate-900/80 border border-slate-800/90 hover:border-slate-700/90 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 shadow-lg hover:shadow-cyan-500/5 group">
        <div class="space-y-3">
          <!-- Top Tag & Update Freq -->
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border ${ds.badgeColor} font-bold tracking-wide">
              ${escapeHtml(ds.badge)}
            </span>
            <div class="flex items-center gap-2 text-[10px] font-mono text-slate-400">
              <span class="text-slate-500">Aggiorn: ${escapeHtml(ds.updateFreq || "Periodico")}</span>
              <span class="px-1.5 py-0.2 rounded bg-slate-950 border border-slate-800 text-slate-300 font-semibold">${year}</span>
            </div>
          </div>

          <!-- Title & Description -->
          <div>
            <h3 class="text-sm sm:text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
              ${escapeHtml(ds.title)}
            </h3>
            <p class="text-xs text-slate-400 mt-1.5 leading-relaxed">
              ${escapeHtml(ds.description)}
            </p>
          </div>

          <!-- Sync Status in DB -->
          <div class="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[10px] uppercase font-mono text-slate-500 font-semibold">Stato Database Locale:</span>
              ${syncBadge}
            </div>
            <div class="text-[11px] text-slate-400">
              ${syncDetail}
            </div>
          </div>

          <!-- Tracciato Record Columns -->
          <div class="space-y-1.5 pt-1">
            <div class="text-[10px] font-mono uppercase text-slate-500 font-semibold flex items-center justify-between">
              <span>Campi Chiave Consip:</span>
              <span class="text-cyan-400/80 font-normal">Tracciato Ufficiale</span>
            </div>
            <div class="flex flex-wrap gap-1">
              ${keyColsHtml}
            </div>
          </div>
        </div>

        <!-- Actions Footer -->
        <div class="mt-5 pt-3.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <a href="${ckanPage}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-semibold border border-slate-700 transition" title="Apri scheda ufficiale verificata sul portale dati.consip.it">
              <span>Scheda CKAN ↗</span>
            </a>
            ${csvDirectUrl ? `
            <a href="${csvDirectUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono transition" title="Scarica file CSV sul tuo computer (${year})">
              <span>CSV (${year})</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </a>
            ` : ""}
          </div>

          <div class="flex items-center gap-1.5">
            <button type="button" onclick="triggerOpenDataUpload('${ds.id}')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition" title="Carica un file dal tuo computer">
              <span>Sfoglia PC</span>
            </button>
            <button type="button" onclick="syncConsipDatasetFromUrl('${ds.id}', '${year}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 text-xs font-bold shadow-sm transition" title="Scarica direttamente dal server Consip ed importa in SQLite con 1 click senza limiti di MB">
              <span>⚡ Sincronizza 1-Click</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// Configura Drag & Drop universale sulla Drop-Zone
function setupOpenDataDragAndDrop() {
  const dropZone = document.getElementById("opendataDropZone");
  const fileInput = document.getElementById("opendataFileInput");
  if (!dropZone || !fileInput) return;

  // Evita propagazioni non volute
  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Highlight visivo
  ["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add("border-cyan-400", "bg-cyan-950/30", "ring-2", "ring-cyan-500/20");
    }, false);
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove("border-cyan-400", "bg-cyan-950/30", "ring-2", "ring-cyan-500/20");
    }, false);
  });

  // Ricezione file con drop
  dropZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      handleOpenDataFileSelected(files[0]);
    }
  }, false);

  // Selezione file via click
  fileInput.onchange = function(e) {
    if (e.target.files && e.target.files.length > 0) {
      handleOpenDataFileSelected(e.target.files[0]);
    }
  };
}

// Trigger upload per un dataset specifico
window.triggerOpenDataUpload = function(datasetId) {
  const fileInput = document.getElementById("opendataFileInput");
  if (fileInput) {
    fileInput.dataset.targetDataset = datasetId || "general";
    fileInput.click();
  }
};

// Elabora il file selezionato via Drop-Zone o Picker
async function handleOpenDataFileSelected(file) {
  if (!file) return;

  const modeSelect = document.getElementById("selectOpendataImportMode");
  const mode = modeSelect ? modeSelect.value : "dedup";

  // Sincronizza con selectImportMode globale se presente
  const globalModeSelect = document.getElementById("selectImportMode");
  if (globalModeSelect) globalModeSelect.value = mode;

  // Informa l'utente
  showNotification(`Elaborazione archivio Consip: ${file.name} (${(file.size / 1024).toFixed(0)} KB)...`);

  try {
    if (typeof handleFileUpload === "function") {
      await handleFileUpload(file);
      await refreshOpenDataStats();
      renderOpenDataCards();
    } else {
      showNotification("Modulo di importazione non disponibile.", false);
    }
  } catch (err) {
    console.error("Errore durante l'importazione del file:", err);
    showNotification("Errore nell'elaborazione del file Consip: " + (err.message || err), false);
  }
}

// Copia negli appunti il comando per ingestione streaming big data (Cataloghi ~600MB)
window.copyStreamIngestionCmd = function() {
  const cmd = "python consip_stream_ingestion.py";
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cmd).then(() => {
      showNotification("Comando di streaming copiato negli appunti!");
    });
  } else {
    const input = document.createElement("input");
    input.value = cmd;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    showNotification("Comando di streaming copiato!");
  }
};

// Cambio anno dataset
window.onOpendataYearChange = function() {
  renderOpenDataCards();
};

// Sincronizzazione 1-Click Diretta da URL Consip (Zero download locale, nessun limite di MB)
window.syncConsipDatasetFromUrl = async function(datasetId, year) {
  const ds = consipDatasets.find(d => d.id === datasetId);
  if (!ds) return;

  const slug = typeof ds.fileSlug === "function" ? ds.fileSlug(year) : "";
  if (!slug) {
    showNotification("Dataset non disponibile per l'anno " + year, false);
    return;
  }
  const url = `https://dati.consip.it/download/dataset/${slug}.csv`;
  const modeSelect = document.getElementById("selectOpendataImportMode");
  const mode = modeSelect ? modeSelect.value : "dedup";

  if (!liveBackendConnected) {
    await showInfoDialog(
      "La sincronizzazione 1-Click ad alte prestazioni richiede il motore SQLite locale attivo (porta 8050).\n\n"
      + "In assenza di connessione puoi scaricare il file con il pulsante 'CSV' o trascinarlo dal PC.",
      { title: "Server Locale Richiesto" }
    );
    return;
  }

  showProgress(0, 100, `Sincronizzazione 1-Click in corso per ${ds.title} (${year})...`);
  try {
    const res = await Api.ingestFromUrl(url, ds.tableName || "auto", mode);
    hideProgress();
    await refreshOpenDataStats();
    renderOpenDataCards();
    showNotification(res.message || `Sincronizzazione completata: ${res.processed} record inseriti in SQLite!`);
    if (ds.tableName === "cataloghi") {
      switchView("cataloghi");
    } else if (ds.tableName === "amministrazioni") {
      switchView("amministrazioni");
    } else if (ds.tableName === "operatori" || ds.tableName === "acquisti") {
      // Rimani sulla schermata Open Data Hub per mostrare il badge di attivazione immediato
    } else {
      switchView("cruscotto");
    }
  } catch (err) {
    hideProgress();
    console.error("Errore sincronizzazione 1-Click:", err);
    showNotification("Impossibile completare la sincronizzazione automatica: " + (err.message || err), false);
  }
};
