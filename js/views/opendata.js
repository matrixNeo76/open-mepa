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
  let catCount = 0;
  let ammCount = 0;
  let storageEngine = "SQLite 3 Wasm";

  if (liveBackendConnected) {
    try {
      const resp = await Api.getStatus();
      gareCount = resp.total_tenders || 0;
      catCount = resp.total_cataloghi || 0;
      ammCount = resp.total_amministrazioni || 0;
      storageEngine = "SQLite 3 Live Server (Porta " + (window.location.port || "8050") + ")";
    } catch (e) {
      console.warn("Fallback su cache locale per statistiche Open Data:", e);
    }
  }

  // Fallback se disconnesso o valori nulli
  if (gareCount === 0 && typeof getAllTendersFromSQLite === "function") {
    gareCount = getAllTendersFromSQLite().length;
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

  window._opendataStats = { gare: gareCount, cat: catCount, amm: ammCount, storage: storageEngine };
}

// Renderizza le 6 card dei dataset ufficiali arricchite con tracciato record e stato sincro
function renderOpenDataCards() {
  const cardsContainer = document.getElementById("datasetCardsContainer");
  const selectYear = document.getElementById("selectDatasetYear");
  if (!cardsContainer) return;

  const year = selectYear ? selectYear.value : "2026";
  const stats = window._opendataStats || { gare: 1822, cat: 287536, amm: 20776 };

  cardsContainer.innerHTML = consipDatasets.map(ds => {
    const ckanPage = typeof ds.ckanDatasetUrl === "function" ? ds.ckanDatasetUrl(year) : ds.ckanUrl;
    
    // Calcola stato di sincronizzazione locale
    let syncBadge = "";
    let syncDetail = "";

    if (ds.id === "negoziazioni" || ds.id === "bandiegare") {
      syncBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Attivo nel DB (${Number(stats.gare).toLocaleString("it-IT")} record)
      </span>`;
      syncDetail = `Tabella relazionale <code class="text-cyan-300 font-mono text-[11px]">${ds.tableName}</code> indicizzata per CIG e scadenze.`;
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
        <div class="mt-5 pt-3.5 border-t border-slate-800 flex items-center justify-between gap-2">
          <a href="${ckanPage}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-semibold border border-slate-700 transition" title="Raggiungi la risorsa ufficiale sul portale Open Data Consip">
            <span>Scheda CKAN Ufficiale</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </a>

          <button type="button" onclick="triggerOpenDataUpload('${ds.id}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold transition" title="Carica un file CSV/JSON scaricato per questo dataset">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            <span>Importa nel DB</span>
          </button>
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
