/**
 * MePA & Consip Desk Pro - Main Application Router & Controller
 * Gestione navigazione sezioni, modali di download/reset, esportazioni dati e bootstrap.
 */

// Selettore viste / Switcher di Sezione
window.switchView = function(viewId) {
  document.querySelectorAll(".section-view").forEach(el => el.classList.add("hidden"));
  const target = document.getElementById("view-" + viewId);
  if (target) target.classList.remove("hidden");

  // Aggiorna classi bottoni sidebar
  const navIds = ["cruscotto", "wizard", "cataloghi", "amministrazioni", "analytics", "opendata", "guida", "sqlite"];
  navIds.forEach(id => {
    const btn = document.getElementById("nav-" + id);
    if (btn) {
      if (id === viewId) {
        btn.className = "w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition nav-item-active";
      } else {
        btn.className = "w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition nav-item-inactive";
      }
    }
  });

  // Aggiorna intestazione Top Bar
  const topBarTitle = document.getElementById("topBarTitle");
  const topBarSubtitle = document.getElementById("topBarSubtitle");
  
  if (topBarTitle && topBarSubtitle) {
    if (viewId === "cruscotto") {
      topBarTitle.innerHTML = `<span>Cruscotto Operativo Gare</span><span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hidden sm:inline-flex">Motore SQLite 3 Attivo</span>`;
      topBarSubtitle.textContent = "Monitora le 4 fasi del ciclo di vita con scadenze a semaforo";
      if (typeof renderApp === "function") renderApp();
    } else if (viewId === "wizard") {
      topBarTitle.innerHTML = `<span>Wizard Deterministico Partecipazione Gara</span><span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hidden sm:inline-flex">Dual-Handoff Agent Ready</span>`;
      topBarSubtitle.textContent = "Workflow guidato in 4 fasi con export payload per automazione browser-use";
      if (!currentWizardGaraId && typeof window.openTenderWizard === "function") {
        window.openTenderWizard(null, 1);
      }
    } else if (viewId === "cataloghi") {
      topBarTitle.innerHTML = `<span>Cataloghi MePA &amp; Listini Prodotti</span><span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hidden sm:inline-flex">287.536 Articoli</span>`;
      topBarSubtitle.textContent = "Banca dati ufficiale Consip, codici CPV europei, Accordi Quadro e Convenzioni";
      if (typeof loadCataloghi === "function") loadCataloghi();
    } else if (viewId === "amministrazioni") {
      topBarTitle.innerHTML = `<span>Anagrafica Amministrazioni Pubbliche</span><span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 hidden sm:inline-flex">20.776 Enti PA</span>`;
      topBarSubtitle.textContent = "Stazioni appaltanti, Codici Fiscali, IPA e Punti Ordinanti abilitati MePA";
      if (typeof loadAmministrazioni === "function") loadAmministrazioni();
    } else if (viewId === "analytics") {
      topBarTitle.innerHTML = `<span>Analisi di Mercato &amp; Statistiche MePA</span><span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 hidden sm:inline-flex">Cruscotto Strategico</span>`;
      topBarSubtitle.textContent = "Distribuzione della spesa, aggregazioni per settore e copertura territoriale";
      if (typeof loadAnalytics === "function") loadAnalytics();
    } else if (viewId === "opendata") {
      topBarTitle.innerHTML = `<span>Open Data Consip Hub</span><span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hidden sm:inline-flex">dati.consip.it</span>`;
      topBarSubtitle.textContent = "Download diretto dataset ufficiali 2025–2028 in formato CSV, JSON e XLSX";
    } else if (viewId === "guida") {
      topBarTitle.innerHTML = `<span>Guida Metodologica Semplice</span><span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 hidden sm:inline-flex">Zero Codice</span>`;
      topBarSubtitle.textContent = "Il metodo in 4 fasi operative sequenziali per gestire le gare senza intoppi";
    } else if (viewId === "sqlite") {
      topBarTitle.innerHTML = `<span>Database SQLite 3 &amp; Manutenzione Dati</span>`;
      topBarSubtitle.textContent = "Database relazionale Wasm, export file .db binario e deduplica CIG";
    }
  }

  closeMobileSidebar();
};

// Sidebar Mobile
function openMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  if (sidebar && sidebarOverlay) {
    sidebar.classList.remove("-translate-x-full");
    sidebarOverlay.classList.remove("hidden");
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  if (sidebar && sidebarOverlay) {
    sidebar.classList.add("-translate-x-full");
    sidebarOverlay.classList.add("hidden");
  }
}

// Hub Open Data & Dataset Cards
function updateDatasetLinks() {
  const datasetCardsContainer = document.getElementById("datasetCardsContainer");
  const selectDatasetYear = document.getElementById("selectDatasetYear");
  if (!datasetCardsContainer || !selectDatasetYear) return;

  const year = selectDatasetYear.value;

  datasetCardsContainer.innerHTML = consipDatasets.map(ds => {
    const slug = ds.fileSlug(year);
    const csvUrl = `https://dati.consip.it/download/dataset/${slug}.csv`;
    const jsonUrl = `https://dati.consip.it/download/dataset/${slug}.json`;
    const xlsxUrl = `https://dati.consip.it/download/dataset/${slug}.xlsx`;

    return `
      <div class="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between transition shadow-md">
        <div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border ${ds.badgeColor} font-bold">${ds.badge}</span>
            <span class="text-[10px] text-slate-500 font-mono">Anno: ${year}</span>
          </div>
          <h3 class="text-sm font-bold text-white">${ds.title}</h3>
          <p class="text-xs text-slate-400 mt-1.5 leading-relaxed">${ds.description}</p>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
          <div class="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Scarica (${year}):</span>
            <a href="${ds.ckanUrl}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:underline flex items-center gap-0.5 font-bold">
              Scheda CKAN ↗
            </a>
          </div>
          <div class="grid grid-cols-3 gap-1.5 pt-0.5">
            <button onclick="handleDownloadHelper('${ds.title}', '${csvUrl}', '${ds.ckanUrl}', '${slug}.csv')" class="px-2 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold transition flex items-center justify-center gap-1">
              <span>CSV</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>
            <button onclick="handleDownloadHelper('${ds.title}', '${jsonUrl}', '${ds.ckanUrl}', '${slug}.json')" class="px-2 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-mono font-bold transition flex items-center justify-center gap-1">
              <span>JSON</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>
            <button onclick="handleDownloadHelper('${ds.title}', '${xlsxUrl}', '${ds.ckanUrl}', '${slug}.xlsx')" class="px-2 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-mono font-bold transition flex items-center justify-center gap-1">
              <span>XLSX</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Modale per il download assistito da Open Data Hub
window.handleDownloadHelper = function(title, fileUrl, ckanUrl, filename) {
  const downloadHelperModal = document.getElementById("downloadHelperModal");
  const helperModalTitle = document.getElementById("helperModalTitle");
  const helperModalSub = document.getElementById("helperModalSub");
  const helperFileUrl = document.getElementById("helperFileUrl");
  const btnOpenCkanPage = document.getElementById("btnOpenCkanPage");
  const btnDirectFileDownload = document.getElementById("btnDirectFileDownload");
  const btnCopyDownloadUrl = document.getElementById("btnCopyDownloadUrl");

  if (!downloadHelperModal) return;

  if (helperModalTitle) helperModalTitle.textContent = `${title} (${filename})`;
  if (helperModalSub) helperModalSub.textContent = fileUrl;
  if (helperFileUrl) helperFileUrl.textContent = fileUrl;
  if (btnOpenCkanPage) btnOpenCkanPage.href = ckanUrl;
  if (btnDirectFileDownload) {
    btnDirectFileDownload.href = fileUrl;
    btnDirectFileDownload.setAttribute("download", filename);
  }

  if (btnCopyDownloadUrl) {
    btnCopyDownloadUrl.onclick = function() {
      const temp = document.createElement("input");
      temp.value = fileUrl;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
      btnCopyDownloadUrl.textContent = "Copiato!";
      setTimeout(() => { btnCopyDownloadUrl.textContent = "Copia Link"; }, 2000);
    };
  }

  downloadHelperModal.classList.remove("hidden");
};

// Download del file binario gare_consip.db
function downloadSQLiteDbBinary() {
  if (liveBackendConnected) {
    const a = document.createElement("a");
    a.href = `${liveBackendUrl}/api/export/db`;
    a.download = `gare_consip.db`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showNotification("Download di gare_consip.db dal server Python avviato!");
    return;
  }
  if (!db) {
    showNotification("Database SQLite non pronto.", false);
    return;
  }
  try {
    const binaryArray = db.export();
    const blob = new Blob([binaryArray], { type: "application/x-sqlite3" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gare_consip_${new Date().toISOString().substring(0, 10)}.db`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification("Database SQLite 3 (gare_consip.db) scaricato con successo!");
  } catch (err) {
    console.error("Errore esportazione SQLite:", err);
    showNotification("Errore durante l'esportazione del file .db", false);
  }
}

// Inizializzazione globale all'avvio del DOM
document.addEventListener("DOMContentLoaded", () => {
  // Mobile Sidebar
  const btnOpenMobileSidebar = document.getElementById("btnOpenMobileSidebar");
  const btnCloseMobileSidebar = document.getElementById("btnCloseMobileSidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  if (btnOpenMobileSidebar) btnOpenMobileSidebar.addEventListener("click", openMobileSidebar);
  if (btnCloseMobileSidebar) btnCloseMobileSidebar.addEventListener("click", closeMobileSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeMobileSidebar);

  // Anno Open Data Hub
  const selectDatasetYear = document.getElementById("selectDatasetYear");
  if (selectDatasetYear) {
    selectDatasetYear.addEventListener("change", () => {
      updateDatasetLinks();
      showNotification(`Link dataset aggiornati per l'anno ${selectDatasetYear.value}.`);
    });
  }

  // Modale Download Helper
  const downloadHelperModal = document.getElementById("downloadHelperModal");
  const btnCloseHelperModal = document.getElementById("btnCloseHelperModal");
  if (btnCloseHelperModal && downloadHelperModal) {
    btnCloseHelperModal.addEventListener("click", () => {
      downloadHelperModal.classList.add("hidden");
    });
  }

  // Esportazione Database SQLite (.db)
  const btnExportSQLiteDb = document.getElementById("btnExportSQLiteDb");
  const btnSidebarDownloadDb = document.getElementById("btnSidebarDownloadDb");
  if (btnExportSQLiteDb) btnExportSQLiteDb.addEventListener("click", downloadSQLiteDbBinary);
  if (btnSidebarDownloadDb) btnSidebarDownloadDb.addEventListener("click", downloadSQLiteDbBinary);

  // Caricamento Dati Demo
  const btnTopLoadSample = document.getElementById("btnTopLoadSample");
  if (btnTopLoadSample) {
    btnTopLoadSample.addEventListener("click", async () => {
      if (liveBackendConnected) {
        await processItemsChunked(initialSeedTenders, "dedup");
        showNotification("Caricati 7 record dimostrativi nel database SQLite su disco.");
      } else {
        seedSQLiteDatabase(initialSeedTenders);
        showNotification("Caricati 7 record dimostrativi nel database SQLite locale.");
      }
      renderApp();
      switchView("cruscotto");
    });
  }

  // Reset del Database (Svuota tutto)
  const clearConfirmModal = document.getElementById("clearConfirmModal");
  const btnOpenClearConfirm = document.getElementById("btnOpenClearConfirm");
  const btnCancelClear = document.getElementById("btnCancelClear");
  const btnConfirmClear = document.getElementById("btnConfirmClear");

  if (btnOpenClearConfirm && clearConfirmModal) {
    btnOpenClearConfirm.addEventListener("click", () => {
      clearConfirmModal.classList.remove("hidden");
    });
  }

  if (btnCancelClear && clearConfirmModal) {
    btnCancelClear.addEventListener("click", () => {
      clearConfirmModal.classList.add("hidden");
    });
  }

  if (btnConfirmClear && clearConfirmModal) {
    btnConfirmClear.addEventListener("click", async () => {
      if (liveBackendConnected) {
        try {
          await fetch(`${liveBackendUrl}/api/reset`, { method: "POST", headers: { "X-Confirm-Reset": "yes" } });
          await reloadFromBackend();
          showNotification("Database SQLite su disco svuotato completamente.");
        } catch (e) {
          showNotification("Errore durante il reset su server Python.", false);
        }
      } else if (db) {
        db.run("DELETE FROM gare;");
        persistWasmToLocalStorage();
        showNotification("Database SQLite svuotato completamente.");
      }
      if (window.fallbackTenders) {
        window.fallbackTenders = [];
      }
      clearConfirmModal.classList.add("hidden");
      renderApp();
      switchView("cruscotto");
    });
  }

  // Esportazione JSON
  const btnExportJSON = document.getElementById("btnExportJSON");
  if (btnExportJSON) {
    btnExportJSON.addEventListener("click", () => {
      const all = getAllTendersFromSQLite();
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(all, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `gare_mepa_consip_${new Date().toISOString().substring(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showNotification("File JSON esportato con successo.");
    });
  }

  // Esportazione CSV
  const btnExportCSV = document.getElementById("btnExportCSV");
  if (btnExportCSV) {
    btnExportCSV.addEventListener("click", () => {
      const all = getAllTendersFromSQLite();
      const headers = ["CIG", "Categoria", "Regione", "Fonte", "Amministrazione", "Oggetto", "Importo_Base", "Scadenza", "Stato", "Responsabile", "Link"];
      const rows = all.map(t => [
        t.cig || "",
        t.category || "",
        t.region || "",
        t.source || "",
        `"${(t.authority || "").replace(/"/g, '""')}"`,
        `"${(t.title || "").replace(/"/g, '""')}"`,
        t.amount || 0,
        t.deadline || "",
        t.status || "",
        `"${(t.owner || "").replace(/"/g, '""')}"`,
        t.link || ""
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `gare_mepa_consip_${new Date().toISOString().substring(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showNotification("File CSV esportato con successo.");
    });
  }

  // Chiusura accessibile modali e sidebar con tasto Escape (WCAG 2.1)
  document.addEventListener("keydown", (e) => {
    // Quick search shortcut: Ctrl+K or Cmd+K
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      const searchInput = document.getElementById("searchInput");
      if (searchInput) {
        window.switchView("cruscotto");
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    if (e.key === "Escape") {
      const tenderModal = document.getElementById("tenderModal");
      const clearConfirmModal = document.getElementById("clearConfirmModal");
      const downloadHelperModal = document.getElementById("downloadHelperModal");
      if (tenderModal && !tenderModal.classList.contains("hidden")) {
        tenderModal.classList.add("hidden");
      }
      if (clearConfirmModal && !clearConfirmModal.classList.contains("hidden")) {
        clearConfirmModal.classList.add("hidden");
      }
      if (downloadHelperModal && !downloadHelperModal.classList.contains("hidden")) {
        downloadHelperModal.classList.add("hidden");
      }
      closeMobileSidebar();
    }
  });
});

// Boot all'evento window.onload
window.onload = async function() {
  updateDatasetLinks();
  if (typeof initCruscotto === "function") {
    initCruscotto();
  }
  await initSQLite();
  if (typeof renderApp === "function") {
    renderApp();
  }
};
