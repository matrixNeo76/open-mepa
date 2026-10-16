/**
 * MePA & Consip Desk Pro - Importer Engine
 * Ingestion asincrona anti-freeze per file CSV, JSON e SQLite .db
 */

function parseCSVLine(text, delimiter = ";") {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === delimiter && !inQuotes) {
      result.push(cur.trim().replace(/^"|"$/g, ""));
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim().replace(/^"|"$/g, ""));
  return result;
}

function findColumnIndices(headerCols) {
  const lower = headerCols.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const map = {
    cig: -1,
    authority: -1,
    title: -1,
    amount: -1,
    deadline: -1,
    status: -1,
    owner: -1,
    link: -1,
    category: -1,
    region: -1
  };

  lower.forEach((h, idx) => {
    if (map.cig === -1 && (h.includes("cig") || h.includes("codicegara") || h.includes("idgara") || h.includes("rdo") || h.includes("idiniziative") || h.includes("idiniziativa"))) map.cig = idx;
    if (map.authority === -1 && (h.includes("amministrazione") || h.includes("ente") || h.includes("stazione") || h.includes("denominazione") || h.includes("pa"))) map.authority = idx;
    if (map.title === -1 && (h.includes("oggetto") || h.includes("titolo") || h.includes("descrizione") || h.includes("iniziativa") || h.includes("bando") || h.includes("denominazioneiniziativa"))) map.title = idx;
    if (map.amount === -1 && (h.includes("importo") || h.includes("base") || h.includes("valore") || h.includes("prezzo") || h.includes("spesa") || h.includes("euro") || h.includes("massimale"))) map.amount = idx;
    if (map.deadline === -1 && (h.includes("scadenza") || h.includes("termine") || h.includes("data") || h.includes("pubblicazione"))) map.deadline = idx;
    if (map.status === -1 && (h.includes("stato") || h.includes("fase"))) map.status = idx;
    if (map.owner === -1 && (h.includes("responsabile") || h.includes("owner") || h.includes("referente"))) map.owner = idx;
    if (map.link === -1 && (h.includes("link") || h.includes("url") || h.includes("portale"))) map.link = idx;
    if (map.category === -1 && (h.includes("categoria") || h.includes("merceolog") || h.includes("settore") || h.includes("cpv"))) map.category = idx;
    if (map.region === -1 && (h.includes("regione") || h.includes("territorio") || h.includes("provincia") || h.includes("area"))) map.region = idx;
  });

  if (map.cig === -1) map.cig = 0;
  if (map.authority === -1) map.authority = 1;
  if (map.title === -1) map.title = 2;
  if (map.amount === -1) map.amount = 3;
  if (map.deadline === -1) map.deadline = 4;

  return map;
}

async function processItemsChunked(items, mode = "dedup") {
  const total = items.length;
  if (total === 0) return { added: 0, updated: 0, total: 0 };

  if (liveBackendConnected) {
    showProgress(0, total, "Salvataggio nel database SQLite su disco...");
    try {
      const resp = await Api.batchGare(items, mode);
      await reloadFromBackend();
      hideProgress();
      return { added: resp.processed, total: resp.total };
    } catch (e) {
      console.error("Batch live fallito, fallback su Wasm:", e);
    }
  }

  if (!db) {
    window.fallbackTenders = items;
    return { added: items.length, updated: 0, total: items.length };
  }

  if (mode === "replace") {
    db.run("DELETE FROM gare;");
  }

  const chunkSize = 150;
  let processed = 0;

  const stmt = db.prepare(`
    INSERT INTO gare (id, cig, category, region, source, authority, title, amount, deadline, status, owner, link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cig) DO UPDATE SET
      amount = CASE WHEN excluded.amount > 0 THEN excluded.amount ELSE gare.amount END,
      title = CASE WHEN excluded.title != '' THEN excluded.title ELSE gare.title END,
      authority = CASE WHEN excluded.authority != '' THEN excluded.authority ELSE gare.authority END,
      deadline = CASE WHEN excluded.deadline != '' THEN excluded.deadline ELSE gare.deadline END,
      category = CASE WHEN excluded.category != 'ALTRO' THEN excluded.category ELSE gare.category END,
      region = CASE WHEN excluded.region != 'Nazionale' THEN excluded.region ELSE gare.region END
  `);

  for (let i = 0; i < total; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    db.run("BEGIN TRANSACTION;");
    for (const item of chunk) {
      stmt.run([
        item.id || ("IMP_" + Math.random().toString(36).substr(2, 9)),
        (item.cig || "").toUpperCase(),
        item.category || "ALTRO",
        item.region || "Nazionale",
        item.source || "Bandi e Gare",
        item.authority || "",
        item.title || "",
        parseFloat(item.amount) || 0,
        item.deadline || "",
        item.status || "Da Valutare",
        item.owner || "",
        item.link || ""
      ]);
    }
    db.run("COMMIT;");

    processed = Math.min(total, i + chunkSize);
    showProgress(processed, total);
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  stmt.free();
  persistWasmToLocalStorage();
  hideProgress();
  return { added: processed, total: getAllTendersFromSQLite().length };
}

async function handleFileUpload(file) {
  if (!file) return;

  const importMode = document.getElementById("selectImportMode") ? document.getElementById("selectImportMode").value : "dedup";
  const fileNameLower = file.name.toLowerCase();

  // Check for Catalog Big Data file (prevent browser memory freeze)
  if (fileNameLower.includes("catalog")) {
    await showInfoDialog(
      "Il file selezionato appartiene ai Cataloghi Consip (~600 MB / ~300.000 righe di articoli).\n\n"
      + "Questo dataset va importato nello storage dedicato 'cataloghi' con il motore di streaming Python:\n"
      + "python consip_stream_ingestion.py\n\n"
      + "Così il browser resta fluido e il cruscotto gare non viene intasato dai listini.",
      { title: "Dataset troppo grande per il browser" });
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    await showInfoDialog(
      `Il file selezionato pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB: caricarlo direttamente nel browser rischia di bloccare la pagina.\n\n`
      + "Per file oltre i 25 MB usa lo script di ingestione 'consip_stream_ingestion.py' collegato al database SQLite 3.",
      { title: "File troppo grande" });
    return;
  }

  // Case 1: Import directly an existing SQLite Database binary file (.db, .sqlite, .sqlite3)
  if (fileNameLower.endsWith(".db") || fileNameLower.endsWith(".sqlite") || fileNameLower.endsWith(".sqlite3")) {
    showProgress(0, 1, "Caricamento database SQLite 3");
    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const uInt8Array = new Uint8Array(event.target.result);
        if (SQL) {
          db = new SQL.Database(uInt8Array);
          hideProgress();
          renderApp();
          showNotification(`Database SQLite "${file.name}" importato con successo!`);
          switchView("cruscotto");
        }
      } catch (err) {
        hideProgress();
        console.error(err);
        showNotification("Impossibile caricare il file SQLite: formato non valido.", false);
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  // Case 2: JSON or CSV file
  let guessedSource = "Bandi e Gare";
  if (fileNameLower.includes("asp")) guessedSource = "Gare ASP";
  else if (fileNameLower.includes("rdo") || fileNameLower.includes("mepa")) guessedSource = "RdO MePA";

  showProgress(0, 100, "Lettura file dal disco...");

  const reader = new FileReader();
  reader.onload = async function(event) {
    try {
      const content = event.target.result;

      // JSON Handling
      if (fileNameLower.endsWith(".json") || content.trim().startsWith("[") || content.trim().startsWith("{")) {
        let jsonParsed = JSON.parse(content);
        if (!Array.isArray(jsonParsed)) {
          if (jsonParsed.records && Array.isArray(jsonParsed.records)) jsonParsed = jsonParsed.records;
          else if (jsonParsed.data && Array.isArray(jsonParsed.data)) jsonParsed = jsonParsed.data;
          else if (jsonParsed.result && Array.isArray(jsonParsed.result.records)) jsonParsed = jsonParsed.result.records;
          else jsonParsed = [jsonParsed];
        }

        const rawItems = jsonParsed.map((item, idx) => {
          const keys = Object.keys(item);
          const findVal = (substrs) => {
            for (const sub of substrs) {
              const match = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, "").includes(sub));
              if (match && item[match] !== undefined) return item[match];
            }
            return "";
          };

          const cig = item.cig || findVal(["cig", "codicegara", "idgara", "rdo", "idiniziative", "idiniziativa", "numero"]) || `GARA_${idx + 1}`;
          const authority = item.authority || findVal(["amministrazione", "ente", "stazione", "denominazioneamministrazione", "denominazione", "acquirente"]) || "Stazione Appaltante";
          const title = item.title || findVal(["oggetto", "titolo", "descrizione", "iniziativa", "denominazioneiniziativa", "bando"]) || "Gara MePA / Consip";
          const rawAmount = item.amount !== undefined ? item.amount : findVal(["importo", "base", "valore", "prezzo", "massimale"]);
          const rawDeadline = item.deadline || findVal(["scadenza", "termine", "data"]);

          const explicitCat = item.category || findVal(["categoria", "merceolog", "cpv"]);
          const detectedCat = explicitCat ? detectCategory(explicitCat) : detectCategory(title);

          const explicitReg = item.region || findVal(["regione", "territorio", "provincia"]);
          const detectedReg = explicitReg || detectRegion(authority + " " + title);

          return {
            id: item.id || `IMP_${String(cig).trim().toUpperCase()}`,
            cig: String(cig).trim().toUpperCase(),
            category: detectedCat,
            region: detectedReg,
            source: item.source || guessedSource,
            authority: String(authority).trim(),
            title: String(title).trim(),
            amount: parseNumericAmount(rawAmount),
            deadline: parseDateString(rawDeadline),
            status: item.status || "Da Valutare",
            owner: item.owner || "",
            link: item.link || "https://www.acquistinretepa.it"
          };
        });

        const res = await processItemsChunked(rawItems, importMode);
        renderApp();
        showNotification(`Importazione completata: ${res.added} gare elaborate nel database SQLite.`);
        switchView("cruscotto");
        return;
      }

      // CSV Handling
      const rawLines = content.split(/\r?\n/).filter(l => l.trim() !== "");
      if (rawLines.length > 1) {
        const firstLine = rawLines[0];
        const countSemicolons = (firstLine.match(/;/g) || []).length;
        const countCommas = (firstLine.match(/,/g) || []).length;
        const countTabs = (firstLine.match(/\t/g) || []).length;

        let delimiter = ";";
        if (countTabs > countSemicolons && countTabs > countCommas) delimiter = "\t";
        else if (countCommas > countSemicolons) delimiter = ",";

        const headerCols = parseCSVLine(rawLines[0], delimiter);
        const colMap = findColumnIndices(headerCols);

        const rawItems = [];
        for (let i = 1; i < rawLines.length; i++) {
          const cols = parseCSVLine(rawLines[i], delimiter);
          if (cols.length >= 2 && cols.some(c => c !== "")) {
            const cig = (colMap.cig !== -1 ? cols[colMap.cig] : "") || `GARA_${i}`;
            const authority = (colMap.authority !== -1 ? cols[colMap.authority] : "") || "Ente Appaltante";
            const title = (colMap.title !== -1 ? cols[colMap.title] : "") || "Fornitura / Servizio MePA";
            const amount = colMap.amount !== -1 ? parseNumericAmount(cols[colMap.amount]) : 0;
            const deadline = colMap.deadline !== -1 ? parseDateString(cols[colMap.deadline]) : "2026-11-30T12:00";
            const status = (colMap.status !== -1 ? cols[colMap.status] : "") || "Da Valutare";
            const owner = colMap.owner !== -1 ? cols[colMap.owner] : "";
            const link = colMap.link !== -1 ? cols[colMap.link] : "https://www.acquistinretepa.it";

            const rawCatCol = colMap.category !== -1 ? cols[colMap.category] : "";
            const cat = rawCatCol ? detectCategory(rawCatCol) : detectCategory(title);

            const rawRegCol = colMap.region !== -1 ? cols[colMap.region] : "";
            const reg = rawRegCol ? rawRegCol : detectRegion(authority + " " + title);

            rawItems.push({
              id: `IMP_${String(cig).trim().toUpperCase()}`,
              cig: cig.toUpperCase(),
              category: cat,
              region: reg,
              source: guessedSource,
              authority: authority,
              title: title,
              amount: amount,
              deadline: deadline,
              status: status,
              owner: owner,
              link: link
            });
          }
        }

        const res = await processItemsChunked(rawItems, importMode);
        renderApp();
        showNotification(`Importazione CSV completata: ${res.added} record elaborati in SQLite.`);
        switchView("cruscotto");
        return;
      }

      showNotification("Formato del file non riconosciuto.", false);
      hideProgress();
    } catch (err) {
      hideProgress();
      console.error(err);
      showNotification("Errore durante la lettura del file: " + err.message, false);
    }
  };
  reader.readAsText(file, "UTF-8");
}
