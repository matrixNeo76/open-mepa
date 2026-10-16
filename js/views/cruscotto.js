/**
 * MePA & Consip Desk Pro - Cruscotto Gare & Fasi (Table & Kanban)
 * Filtri reattivi, ordinamento, paginazione, Drag & Drop nativo e form modal
 */

// Cruscotto State
let currentPage = 1;
let pageSize = 15;
let searchDebounceTimer = null;

const CONCLUDED_STATUSES = ["Vinta", "Persa", "Scartata"];

/**
 * Una gara e' "attiva" se non e' conclusa e (ha scadenza futura, oppure e' gia' stata
 * inviata e si attende l'esito). Le gare scadute non inviate finiscono in archivio.
 */
function isTenderActive(t) {
  if (CONCLUDED_STATUSES.includes(t.status)) return false;
  if (t.status === "Inviata") return true;
  if (!t.deadline) return true;
  const d = new Date(t.deadline);
  return isNaN(d.getTime()) || d.getTime() >= Date.now();
}

function getFilteredAndSortedTenders() {
  const all = getAllTendersFromSQLite();
  const searchInput = document.getElementById("searchInput");
  const filterCategory = document.getElementById("filterCategory");
  const filterRegion = document.getElementById("filterRegion");
  const filterSource = document.getElementById("filterSource");
  const filterStatus = document.getElementById("filterStatus");
  const sortTenders = document.getElementById("sortTenders");

  const term = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const cat = filterCategory ? filterCategory.value : "ALL";
  const reg = filterRegion ? filterRegion.value : "ALL";
  const src = filterSource ? filterSource.value : "ALL";
  const st = filterStatus ? filterStatus.value : "ALL";
  const sortType = sortTenders ? sortTenders.value : "deadline_asc";

  let result = all.filter(t => {
    if (term) {
      const matchCig = (t.cig || "").toLowerCase().includes(term);
      const matchTitle = (t.title || "").toLowerCase().includes(term);
      const matchAuth = (t.authority || "").toLowerCase().includes(term);
      const matchOwner = (t.owner || "").toLowerCase().includes(term);
      if (!matchCig && !matchTitle && !matchAuth && !matchOwner) return false;
    }

    if (cat === "DUAL_IT_PAPER") {
      if (t.category !== "IT" && t.category !== "CANCELLERIA") return false;
    } else if (cat !== "ALL" && t.category !== cat) {
      return false;
    }

    if (reg !== "ALL" && t.region !== reg) return false;
    if (src !== "ALL" && t.source !== src) return false;

    if (st === "SOLO_ATTIVE") {
      if (!isTenderActive(t)) return false;
    } else if (st === "SCADUTE") {
      if (isTenderActive(t) || CONCLUDED_STATUSES.includes(t.status)) return false;
    } else if (st !== "ALL" && t.status !== st) {
      return false;
    }

    return true;
  });

  result.sort((a, b) => {
    const timeA = new Date(a.deadline || "9999-12-31").getTime();
    const timeB = new Date(b.deadline || "9999-12-31").getTime();

    switch(sortType) {
      case "deadline_asc":
        return timeA - timeB;
      case "deadline_desc":
        return timeB - timeA;
      case "amount_desc":
        return (b.amount || 0) - (a.amount || 0);
      case "amount_asc":
        return (a.amount || 0) - (b.amount || 0);
      case "cig_asc":
        return (a.cig || "").localeCompare(b.cig || "");
      default:
        return timeA - timeB;
    }
  });

  return result;
}

window.toggleSortDeadline = function() {
  const sortTenders = document.getElementById("sortTenders");
  if (!sortTenders) return;
  sortTenders.value = sortTenders.value === "deadline_asc" ? "deadline_desc" : "deadline_asc";
  renderApp();
};

window.applyFastFilter = function(filterName, value) {
  const filterCategory = document.getElementById("filterCategory");
  const filterStatus = document.getElementById("filterStatus");
  const sortTenders = document.getElementById("sortTenders");

  // Reset active chip states
  document.querySelectorAll(".chip-ghost").forEach(c => c.classList.remove("active"));

  if (filterName === "category" && filterCategory) {
    filterCategory.value = value;
    if (value === "IT") document.getElementById("chipIT")?.classList.add("active");
    if (value === "CANCELLERIA") document.getElementById("chipPaper")?.classList.add("active");
    if (value === "DUAL_IT_PAPER") document.getElementById("chipDual")?.classList.add("active");
  } else if (filterName === "status" && filterStatus) {
    filterStatus.value = value;
    if (value === "SOLO_ATTIVE") document.getElementById("chipActive")?.classList.add("active");
  } else if (filterName === "expiring_soon") {
    if (sortTenders) sortTenders.value = "deadline_asc";
    if (filterStatus) filterStatus.value = "SOLO_ATTIVE";
    document.getElementById("chipExpiring")?.classList.add("active");
  }
  renderApp();
  showNotification(`Filtro applicato: ${value}`);
};

function renderApp() {
  const all = getAllTendersFromSQLite();
  const filtered = getFilteredAndSortedTenders();

  const statFiltered = document.getElementById("statFiltered");
  const statTotal = document.getElementById("statTotal");
  const sideStatFiltered = document.getElementById("sideStatFiltered");
  const sideStatTotal = document.getElementById("sideStatTotal");
  const statExpiring = document.getElementById("statExpiring");
  const sideStatExpiring = document.getElementById("sideStatExpiring");
  const statInProgress = document.getElementById("statInProgress");
  const statTotalValue = document.getElementById("statTotalValue");

  if (statFiltered) statFiltered.textContent = filtered.length;
  if (statTotal) statTotal.textContent = `/ ${all.length}`;
  if (sideStatFiltered) sideStatFiltered.textContent = filtered.length;
  if (sideStatTotal) sideStatTotal.textContent = `/ ${all.length}`;

  const expiringCount = all.filter(t => {
    const rem = calculateTimeRemaining(t.deadline);
    return rem.days >= 0 && rem.days <= 7 && !["Vinta", "Persa", "Scartata"].includes(t.status);
  }).length;

  if (statExpiring) statExpiring.textContent = expiringCount;
  if (sideStatExpiring) sideStatExpiring.textContent = expiringCount;

  const inProgressCount = all.filter(t => ["In Lavorazione", "Inviata"].includes(t.status)).length;
  if (statInProgress) statInProgress.textContent = inProgressCount;

  const totalVal = filtered.reduce((acc, cur) => acc + (parseFloat(cur.amount) || 0), 0);
  if (statTotalValue) statTotalValue.textContent = formatEUR(totalVal);

  // Pagination math
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const pageItems = filtered.slice(startIdx, endIdx);

  // Controls in UI
  const paginationInfo = document.getElementById("paginationInfo");
  const pageCurrentDisplay = document.getElementById("pageCurrentDisplay");
  const btnPageFirst = document.getElementById("btnPageFirst");
  const btnPagePrev = document.getElementById("btnPagePrev");
  const btnPageNext = document.getElementById("btnPageNext");
  const btnPageLast = document.getElementById("btnPageLast");

  if (paginationInfo) {
    paginationInfo.textContent = filtered.length > 0 
      ? `${startIdx + 1} - ${endIdx} di ${filtered.length} gare`
      : "0 gare";
  }
  if (pageCurrentDisplay) {
    pageCurrentDisplay.textContent = `Pagina ${currentPage} di ${totalPages}`;
  }
  if (btnPageFirst) btnPageFirst.disabled = (currentPage <= 1);
  if (btnPagePrev) btnPagePrev.disabled = (currentPage <= 1);
  if (btnPageNext) btnPageNext.disabled = (currentPage >= totalPages);
  if (btnPageLast) btnPageLast.disabled = (currentPage >= totalPages);

  const tableBody = document.getElementById("tableBody");
  if (tableBody) {
    if (pageItems.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-12 text-slate-400 bg-slate-950/40">
            <div class="text-sm font-semibold text-slate-300">Nessuna gara corrispondente ai filtri nel database.</div>
            <div class="text-xs text-slate-500 mt-1">Carica un file JSON/CSV da Consip o premi "Dati Demo".</div>
          </td>
        </tr>
      `;
    } else {
      // Find max amount in visible page for proportion bars
      const amounts = pageItems.map(t => parseNumericAmount(t.amount)).filter(a => a > 0);
      const maxPageAmount = amounts.length > 0 ? Math.max(...amounts) : 1;

      tableBody.innerHTML = pageItems.map(t => {
        const rem = calculateTimeRemaining(t.deadline);
        const deadlineFormatted = t.deadline ? escapeHtml(t.deadline.replace("T", " ")) : "-";
        const amtNum = parseNumericAmount(t.amount);
        const amtPct = Math.max(5, Math.min(100, Math.round((amtNum / maxPageAmount) * 100)));

        return `
          <tr class="hover:bg-slate-800/40 transition-colors border-b border-slate-800/70 group">
            <td class="py-2.5 px-3.5 whitespace-nowrap">
              <div class="font-mono font-bold text-cyan-400 text-xs tracking-tight">${escapeHtml(t.cig || '-')}</div>
              <div class="mt-0.5">${getSourceBadge(t.source)}</div>
            </td>
            <td class="py-2.5 px-3.5 whitespace-nowrap">
              ${getCategoryBadge(t.category)}
            </td>
            <td class="py-2.5 px-3.5 max-w-[200px]">
              <div class="font-medium text-slate-200 truncate text-xs" title="${escapeHtml(t.authority)}">${escapeHtml(t.authority || 'Ente PA')}</div>
              <div class="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                <span>📍</span> ${escapeHtml(t.region || 'Nazionale')}
              </div>
            </td>
            <td class="py-2.5 px-3.5 max-w-[280px]">
              <div class="font-medium text-slate-100 line-clamp-2 text-xs leading-snug group-hover:text-cyan-200 transition-colors" title="${escapeHtml(t.title)}">${escapeHtml(t.title || 'Senza descrizione')}</div>
              ${t.link ? `<a href="${escapeHtml(t.link)}" target="_blank" rel="noopener noreferrer" class="text-[10px] text-cyan-400 hover:text-cyan-300 hover:underline font-mono inline-flex items-center gap-1 mt-0.5">Apri Portale MePA ↗</a>` : ''}
            </td>
            <td class="py-2.5 px-3.5 text-right whitespace-nowrap">
              <div class="flex flex-col items-end gap-1">
                <span class="text-xs font-mono font-bold text-slate-100 tabular-nums">${formatEUR(t.amount)}</span>
                <div class="proportion-track" title="Proporzione: ${amtPct}% del massimo visibile">
                  <div class="proportion-fill" style="width: ${amtPct}%"></div>
                </div>
              </div>
            </td>
            <td class="py-2.5 px-3.5 font-mono text-xs text-slate-300 whitespace-nowrap">
              <div class="${rem.days >= 0 && rem.days <= 3 ? 'text-rose-400 font-bold' : ''}">${deadlineFormatted}</div>
            </td>
            <td class="py-2.5 px-3.5 text-center whitespace-nowrap">
              <span class="inline-block px-2.5 py-1 rounded-md text-[11px] font-mono ${rem.badgeBg} ${rem.colorClass}">
                ${rem.text}
              </span>
            </td>
            <td class="py-2.5 px-3.5 text-center whitespace-nowrap">
              ${getStatusBadge(t.status)}
            </td>
            <td class="py-2.5 px-3.5 text-slate-400 font-mono text-xs whitespace-nowrap">${escapeHtml(t.owner || '-')}</td>
            <td class="py-2.5 px-3.5 text-center whitespace-nowrap">
              <div class="inline-flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button onclick="window.openTenderWizard('${escapeHtml(t.id)}', 1)" aria-label="Apri Wizard 4 Fasi Gara CIG ${escapeHtml(t.cig || '')}" class="touch-target-action px-2 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 font-mono text-[11px] font-bold border border-cyan-500/40 transition flex items-center gap-1 shadow-sm" title="Avvia Wizard Guidato 4 Fasi (MePA/Consip)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  <span>Wizard</span>
                </button>
                <button onclick="editTender('${escapeHtml(t.id)}')" aria-label="Modifica Gara CIG ${escapeHtml(t.cig || '')}" class="touch-target-action p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700/60 transition" title="Modifica Gara">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onclick="deleteTender('${escapeHtml(t.id)}')" aria-label="Elimina Gara CIG ${escapeHtml(t.cig || '')}" class="touch-target-action p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition" title="Rimuovi">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  renderKanbanColumns(filtered);
}

function renderKanbanColumns(items) {
  const col1 = document.getElementById("kanbanCol1");
  const col2 = document.getElementById("kanbanCol2");
  const col3 = document.getElementById("kanbanCol3");
  const col4 = document.getElementById("kanbanCol4");
  if (!col1 || !col2 || !col3 || !col4) return;

  const list1 = items.filter(t => t.status === "Da Valutare" || !t.status);
  const list2 = items.filter(t => t.status === "In Lavorazione");
  const list3 = items.filter(t => t.status === "Inviata");
  const list4 = items.filter(t => ["Vinta", "Persa", "Scartata"].includes(t.status));

  const b1 = document.getElementById("badgeCount1");
  const b2 = document.getElementById("badgeCount2");
  const b3 = document.getElementById("badgeCount3");
  const b4 = document.getElementById("badgeCount4");
  if (b1) b1.textContent = list1.length;
  if (b2) b2.textContent = list2.length;
  if (b3) b3.textContent = list3.length;
  if (b4) b4.textContent = list4.length;

  function renderCards(list) {
    if (list.length === 0) return `<div class="text-xs text-slate-500 text-center py-8">Trascina qui una gara</div>`;
    const MAX_KANBAN_CARDS = 35;
    const visible = list.slice(0, MAX_KANBAN_CARDS);
    let html = visible.map(t => {
      const rem = calculateTimeRemaining(t.deadline);
      return `
        <div draggable="true" ondragstart="handleDragStart(event, '${escapeHtml(t.id)}')" class="kanban-card bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 rounded-xl p-3 shadow-md space-y-2 cursor-grab active:cursor-grabbing transition">
          <div class="flex items-center justify-between text-xs">
            <span class="font-mono font-bold text-cyan-400 tracking-tight">${escapeHtml(t.cig || '-')}</span>
            <span class="font-mono text-emerald-400 font-semibold tabular-nums">${formatEUR(t.amount)}</span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${getCategoryBadge(t.category)}
            <span class="text-[10px] text-slate-400 font-mono">📍 ${escapeHtml(t.region || 'Nazionale')}</span>
          </div>
          <p class="text-xs text-slate-100 font-medium line-clamp-2 leading-relaxed">${escapeHtml(t.title || 'Senza descrizione')}</p>
          <div class="text-[11px] text-slate-400 truncate">${escapeHtml(t.authority || 'Ente PA')}</div>
          <div class="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
            <span class="px-2 py-0.5 rounded font-mono ${rem.badgeBg} ${rem.colorClass}">${rem.text}</span>
            <button onclick="editTender('${escapeHtml(t.id)}')" class="text-slate-400 hover:text-cyan-400 font-medium transition">Modifica ✎</button>
          </div>
        </div>
      `;
    }).join('');

    if (list.length > MAX_KANBAN_CARDS) {
      const remaining = list.length - MAX_KANBAN_CARDS;
      html += `
        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-center text-xs text-slate-400 font-mono">
          <span>+ Altre <strong class="text-cyan-400 font-bold">${remaining.toLocaleString('it-IT')}</strong> gare in questa fase</span>
          <button onclick="document.getElementById('btnViewTable').click();" class="block w-full mt-1.5 py-1 text-cyan-400 hover:text-cyan-300 hover:underline text-[11px] font-sans font-semibold">
            Visualizza tutte nella Vista Tabellare →
          </button>
        </div>
      `;
    }
    return html;
  }

  col1.innerHTML = renderCards(list1);
  col2.innerHTML = renderCards(list2);
  col3.innerHTML = renderCards(list3);
  col4.innerHTML = renderCards(list4);
}

// Drag & Drop Handlers
window.handleDragStart = function(e, id) {
  e.dataTransfer.setData("text/plain", id);
  e.dataTransfer.effectAllowed = "move";
};

window.handleDragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("border-cyan-400", "bg-slate-900/90");
};

window.handleDragLeave = function(e) {
  e.currentTarget.classList.remove("border-cyan-400", "bg-slate-900/90");
};

window.handleDrop = async function(e, targetStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove("border-cyan-400", "bg-slate-900/90");
  const id = e.dataTransfer.getData("text/plain");
  if (!id) return;
  await updateTenderStatus(id, targetStatus);
};

window.updateTenderStatus = async function(id, newStatus) {
  const all = getAllTendersFromSQLite();
  const tender = all.find(t => t.id === id);
  if (!tender) return;
  tender.status = newStatus;

  if (liveBackendConnected) {
    try {
      await Api.saveGara(tender);
      await reloadFromBackend();
    } catch (e) {
      console.error("Errore aggiornamento stato live:", e);
    }
  } else if (db) {
    db.run("UPDATE gare SET status = ? WHERE id = ?", [newStatus, id]);
    persistWasmToLocalStorage();
  }
  renderApp();
  showNotification(`Gara ${tender.cig || id} avanzata alla fase: ${newStatus}`);
};

// Modal Operations
function openModal(tender = null) {
  const tenderModal = document.getElementById("tenderModal");
  const modalTitle = document.getElementById("modalTitle");
  const tenderForm = document.getElementById("tenderForm");
  if (!tenderModal || !tenderForm) return;

  tenderForm.reset();
  if (tender) {
    if (modalTitle) modalTitle.textContent = "Modifica Gara " + (tender.cig || '');
    document.getElementById("formId").value = tender.id;
    document.getElementById("formCIG").value = tender.cig || "";
    document.getElementById("formAmount").value = tender.amount || 0;
    document.getElementById("formCategory").value = tender.category || "IT";
    document.getElementById("formRegion").value = tender.region || "Lombardia";
    document.getElementById("formAuthority").value = tender.authority || "";
    document.getElementById("formTitle").value = tender.title || "";
    document.getElementById("formDeadline").value = tender.deadline || "2026-11-15T12:00";
    document.getElementById("formStatus").value = tender.status || "Da Valutare";
    document.getElementById("formOwner").value = tender.owner || "";
    document.getElementById("formLink").value = tender.link || "";
  } else {
    if (modalTitle) modalTitle.textContent = "Nuova Gara nel Monitoraggio";
    document.getElementById("formId").value = "";
    document.getElementById("formCategory").value = "IT";
    document.getElementById("formRegion").value = "";
    document.getElementById("formDeadline").value = "2026-11-15T12:00";
  }
  tenderModal.classList.remove("hidden");
}

function closeModal() {
  const tenderModal = document.getElementById("tenderModal");
  if (tenderModal) tenderModal.classList.add("hidden");
}

window.editTender = function(id) {
  const all = getAllTendersFromSQLite();
  const t = all.find(item => item.id === id);
  if (t) openModal(t);
};

window.deleteTender = async function(id) {
  const confirmed = await showConfirmDialog(
    "La gara verra' rimossa dal database insieme al relativo avanzamento nel Wizard. L'operazione non e' reversibile.",
    { title: "Rimuovere la gara?", confirmLabel: "Rimuovi gara", danger: true }
  );
  if (!confirmed) return;
  if (liveBackendConnected) {
    try {
      await Api.deleteGara(id);
      await reloadFromBackend();
      showNotification("Gara rimossa dal database SQLite su disco.");
    } catch (e) {
      showNotification("Errore eliminazione dal server.", false);
    }
  } else if (db) {
    db.run("DELETE FROM gare WHERE id = ?", [id]);
    persistWasmToLocalStorage();
    showNotification("Gara rimossa dall'elenco locale.");
  } else if (window.fallbackTenders) {
    window.fallbackTenders = window.fallbackTenders.filter(t => t.id !== id);
    showNotification("Gara rimossa dalla memoria temporanea.");
  }
  renderApp();
};

function initCruscotto() {
  const btnViewTable = document.getElementById("btnViewTable");
  const btnViewKanban = document.getElementById("btnViewKanban");
  const tableView = document.getElementById("tableView");
  const kanbanView = document.getElementById("kanbanView");

  if (btnViewTable && btnViewKanban && tableView && kanbanView) {
    btnViewTable.addEventListener("click", () => {
      tableView.classList.remove("hidden");
      kanbanView.classList.add("hidden");
      btnViewTable.className = "px-3 py-1 font-bold rounded-lg bg-cyan-500 text-slate-950 transition";
      btnViewKanban.className = "px-3 py-1 font-semibold rounded-lg text-slate-400 hover:text-white transition";
    });

    btnViewKanban.addEventListener("click", () => {
      tableView.classList.add("hidden");
      kanbanView.classList.remove("hidden");
      btnViewKanban.className = "px-3 py-1 font-bold rounded-lg bg-cyan-500 text-slate-950 transition";
      btnViewTable.className = "px-3 py-1 font-semibold rounded-lg text-slate-400 hover:text-white transition";
    });
  }

  const btnSidebarNewTender = document.getElementById("btnSidebarNewTender");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const btnCancelModal = document.getElementById("btnCancelModal");
  const tenderForm = document.getElementById("tenderForm");

  if (btnSidebarNewTender) btnSidebarNewTender.addEventListener("click", () => openModal(null));
  if (btnCloseModal) btnCloseModal.addEventListener("click", closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener("click", closeModal);

  if (tenderForm) {
    tenderForm.addEventListener("submit", async function(e) {
      e.preventDefault();
      const rawCig = document.getElementById("formCIG").value.trim().toUpperCase();
      if (!rawCig || rawCig.length < 5) {
        showNotification("Il Codice CIG deve contenere almeno 5 caratteri alfanumerici.", false);
        return;
      }
      const rawAmt = parseNumericAmount(document.getElementById("formAmount").value);
      if (rawAmt < 0) {
        showNotification("L'importo base d'asta non può essere negativo.", false);
        return;
      }

      const id = document.getElementById("formId").value || ("T_" + Date.now());
      const tenderData = {
        id,
        cig: rawCig,
        amount: rawAmt,
        category: document.getElementById("formCategory").value,
        region: document.getElementById("formRegion").value || "Nazionale",
        source: "Manuale",
        authority: document.getElementById("formAuthority").value.trim(),
        title: document.getElementById("formTitle").value.trim(),
        deadline: document.getElementById("formDeadline").value,
        status: document.getElementById("formStatus").value,
        owner: document.getElementById("formOwner").value.trim(),
        link: document.getElementById("formLink").value.trim()
      };

      if (liveBackendConnected) {
        try {
          await Api.saveGara(tenderData);
          await reloadFromBackend();
          closeModal();
          renderApp();
          showNotification(`Gara ${tenderData.cig} salvata in SQLite su disco!`);
          return;
        } catch (err) {
          console.error("Errore salvataggio server live:", err);
        }
      }

      if (db) {
        const stmt = db.prepare(`
          INSERT INTO gare (id, cig, category, region, source, authority, title, amount, deadline, status, owner, link)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(cig) DO UPDATE SET
            category = excluded.category,
            region = excluded.region,
            authority = excluded.authority,
            title = excluded.title,
            amount = excluded.amount,
            deadline = excluded.deadline,
            status = excluded.status,
            owner = excluded.owner,
            link = excluded.link
        `);
        stmt.run([
          tenderData.id,
          tenderData.cig,
          tenderData.category,
          tenderData.region,
          tenderData.source,
          tenderData.authority,
          tenderData.title,
          tenderData.amount,
          tenderData.deadline,
          tenderData.status,
          tenderData.owner,
          tenderData.link
        ]);
        stmt.free();
        persistWasmToLocalStorage();
      } else {
        if (!window.fallbackTenders) window.fallbackTenders = [];
        const existingIdx = window.fallbackTenders.findIndex(t => t.cig === tenderData.cig);
        if (existingIdx >= 0) window.fallbackTenders[existingIdx] = tenderData;
        else window.fallbackTenders.push(tenderData);
      }

      closeModal();
      renderApp();
      showNotification(`Gara ${tenderData.cig} memorizzata localmente.`);
    });
  }

  // Filter Listeners
  const filterCategory = document.getElementById("filterCategory");
  const sortTenders = document.getElementById("sortTenders");
  const filterRegion = document.getElementById("filterRegion");
  const filterSource = document.getElementById("filterSource");
  const filterStatus = document.getElementById("filterStatus");
  const searchInput = document.getElementById("searchInput");
  const btnResetFilters = document.getElementById("btnResetFilters");

  [filterCategory, sortTenders, filterRegion, filterSource, filterStatus].forEach(el => {
    if (el) {
      el.addEventListener("change", () => {
        currentPage = 1;
        renderApp();
      });
    }
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        currentPage = 1;
        renderApp();
      }, 250);
    });
  }

  if (btnResetFilters) {
    btnResetFilters.addEventListener("click", () => {
      if (filterCategory) filterCategory.value = "ALL";
      if (sortTenders) sortTenders.value = "deadline_asc";
      if (filterRegion) filterRegion.value = "ALL";
      if (filterSource) filterSource.value = "ALL";
      if (filterStatus) filterStatus.value = "SOLO_ATTIVE";
      if (searchInput) searchInput.value = "";
      renderApp();
      showNotification("Tutti i filtri sono stati reimpostati.");
    });
  }

  // Preset Tabs
  const tabPresetMyCategories = document.getElementById("tabPresetMyCategories");
  const tabPresetExpiring = document.getElementById("tabPresetExpiring");
  const tabPresetAll = document.getElementById("tabPresetAll");

  if (tabPresetMyCategories) {
    tabPresetMyCategories.addEventListener("click", () => {
      if (filterCategory) filterCategory.value = "DUAL_IT_PAPER";
      if (filterStatus) filterStatus.value = "SOLO_ATTIVE";
      if (sortTenders) sortTenders.value = "deadline_asc";
      tabPresetMyCategories.className = "px-2.5 py-1 rounded-lg font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition";
      if (tabPresetExpiring) tabPresetExpiring.className = "px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition";
      if (tabPresetAll) tabPresetAll.className = "px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition";
      renderApp();
      showNotification("Vista attivata: Solo Informatica e Cancelleria attive.");
    });
  }

  if (tabPresetExpiring) {
    tabPresetExpiring.addEventListener("click", () => {
      if (filterCategory) filterCategory.value = "ALL";
      if (filterStatus) filterStatus.value = "SOLO_ATTIVE";
      if (sortTenders) sortTenders.value = "deadline_asc";
      tabPresetExpiring.className = "px-2.5 py-1 rounded-lg font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 transition";
      if (tabPresetMyCategories) tabPresetMyCategories.className = "px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition";
      if (tabPresetAll) tabPresetAll.className = "px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition";
      renderApp();
      showNotification("Vista attivata: Gare ordinate per termine imminente.");
    });
  }

  if (tabPresetAll) {
    tabPresetAll.addEventListener("click", () => {
      if (filterCategory) filterCategory.value = "ALL";
      if (filterStatus) filterStatus.value = "ALL";
      if (sortTenders) sortTenders.value = "deadline_asc";
      tabPresetAll.className = "px-2.5 py-1 rounded-lg font-bold bg-slate-800 text-white transition";
      if (tabPresetMyCategories) tabPresetMyCategories.className = "px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition";
      if (tabPresetExpiring) tabPresetExpiring.className = "px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition";
      renderApp();
    });
  }

  // Pagination Controls
  const selectPageSize = document.getElementById("selectPageSize");
  const btnPageFirst = document.getElementById("btnPageFirst");
  const btnPagePrev = document.getElementById("btnPagePrev");
  const btnPageNext = document.getElementById("btnPageNext");
  const btnPageLast = document.getElementById("btnPageLast");

  if (selectPageSize) {
    selectPageSize.addEventListener("change", () => {
      pageSize = parseInt(selectPageSize.value, 10) || 15;
      currentPage = 1;
      renderApp();
    });
  }

  if (btnPageFirst) {
    btnPageFirst.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage = 1;
        renderApp();
      }
    });
  }

  if (btnPagePrev) {
    btnPagePrev.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderApp();
      }
    });
  }

  if (btnPageNext) {
    btnPageNext.addEventListener("click", () => {
      const filtered = getFilteredAndSortedTenders();
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (currentPage < totalPages) {
        currentPage++;
        renderApp();
      }
    });
  }

  if (btnPageLast) {
    btnPageLast.addEventListener("click", () => {
      const filtered = getFilteredAndSortedTenders();
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (currentPage < totalPages) {
        currentPage = totalPages;
        renderApp();
      }
    });
  }
}

/**
 * Esporta le scadenze di tutte le gare attive in formato standard iCalendar (.ics)
 * Compatibile con Microsoft Outlook, Google Calendar, Apple Calendar e smartphone
 */
window.exportAllActiveTendersIcs = function() {
  const all = getAllTendersFromSQLite();
  const activeTenders = all.filter(t => !["Vinta", "Persa", "Scartata"].includes(t.status) && t.deadline);
  if (activeTenders.length === 0) {
    if (typeof showInfoDialog === "function") {
      showInfoDialog({
        title: "Nessuna Scadenza Attiva",
        message: "Non vi sono gare attive con data di scadenza definita nel database da esportare in calendario."
      });
    } else {
      showNotification("Nessuna gara attiva con data di scadenza da esportare.", false);
    }
    return;
  }

  if (typeof LegalTemplates !== "undefined" && LegalTemplates.downloadIcsFile) {
    LegalTemplates.downloadIcsFile(activeTenders, "scadenze_gare_mepa_attive.ics");
    showNotification(`Calendario .ics esportato con successo (${activeTenders.length} gare attive)!`);
  } else if (typeof Api !== "undefined") {
    window.open(Api.getIcsExportUrl(), "_blank");
  }
};

