/**
 * MePA & Consip Desk Pro - Dual-Mode SQLite Database Engine
 * Gestisce la connessione con il Server Python REST su disco (gare_consip.db)
 * oppure effettua il fallback automatico su sql.js (WebAssembly) in locale.
 */

// Global SQLite references
let db = null;
let SQL = null;

// Connection State
let liveBackendConnected = false;
let liveBackendUrl = "";
let liveTendersCache = [];

function persistWasmToLocalStorage() {
  if (!db || liveBackendConnected) return;
  try {
    const exported = db.export();
    let binaryString = "";
    for (let i = 0; i < exported.length; i++) {
      binaryString += String.fromCharCode(exported[i]);
    }
    const base64 = btoa(binaryString);
    localStorage.setItem("mepa_sqlite_backup_wasm", base64);
  } catch (e) {
    console.warn("Impossibile salvare snapshot su localStorage:", e);
  }
}

function loadWasmFromLocalStorage() {
  if (!SQL) return null;
  try {
    const base64 = localStorage.getItem("mepa_sqlite_backup_wasm");
    if (base64) {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new SQL.Database(bytes);
    }
  } catch (e) {
    console.warn("Errore caricamento backup localStorage:", e);
  }
  return null;
}

async function probeBackend() {
  const candidates = [
    window.location.origin,
    "http://127.0.0.1:8050",
    "http://localhost:8050",
    "http://127.0.0.1:8000",
    "http://localhost:8000"
  ];
  for (const origin of candidates) {
    if (!origin || origin.startsWith("file:") || origin === "null") continue;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const resp = await fetch(`${origin}/api/status`, { method: "GET", signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === "connected") {
          liveBackendConnected = true;
          liveBackendUrl = origin;
          return true;
        }
      }
    } catch (e) {
      // Continue probing next candidate
    }
  }
  return false;
}

async function reloadFromBackend() {
  if (!liveBackendConnected) return;
  try {
    const resp = await fetch(`${liveBackendUrl}/api/gare`, { method: "GET" });
    if (resp.ok) {
      liveTendersCache = await resp.json();
    }
  } catch (e) {
    console.error("Errore fetch gare dal server Python:", e);
  }
}

async function initSQLite() {
  const statusText = document.getElementById("sqliteStatusText");
  const statusDot = document.getElementById("sqliteStatusDot");

  // Step 1: Probe for live Python server
  const hasLiveServer = await probeBackend();
  if (hasLiveServer) {
    await reloadFromBackend();
    if (statusText) statusText.textContent = "SQLite 3: Server Python (gare_consip.db)";
    if (statusDot) {
      statusDot.className = "text-emerald-400 font-semibold";
      statusDot.textContent = "● Live Sync";
    }
    const topBarSub = document.getElementById("topBarSubtitle");
    if (topBarSub) topBarSub.textContent = "Connesso a gare_consip.db su disco con sincronizzazione istantanea";
    if (typeof renderApp === "function") renderApp();
    showNotification("Connesso al server Python nativo: database gare_consip.db attivo!");
    return;
  }

  // Step 2: Fallback to in-browser Wasm SQLite (sql.js)
  try {
    if (typeof initSqlJs !== "function") {
      throw new Error("Libreria sql.js non disponibile.");
    }

    SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    db = loadWasmFromLocalStorage();

    if (!db) {
      db = new SQL.Database();
      db.run(`
        CREATE TABLE IF NOT EXISTS gare (
          id TEXT PRIMARY KEY,
          cig TEXT UNIQUE,
          category TEXT,
          region TEXT,
          source TEXT,
          authority TEXT,
          title TEXT,
          amount REAL,
          deadline TEXT,
          status TEXT,
          owner TEXT,
          link TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_cig ON gare(cig);
        CREATE INDEX IF NOT EXISTS idx_category ON gare(category);
        CREATE INDEX IF NOT EXISTS idx_deadline ON gare(deadline);
      `);
      if (typeof initialSeedTenders !== "undefined") {
        seedSQLiteDatabase(initialSeedTenders);
      }
    }

    if (statusText) statusText.textContent = "SQLite 3: Wasm Standalone (Offline)";
    if (statusDot) {
      statusDot.className = "text-cyan-400 font-semibold";
      statusDot.textContent = "● Standalone";
    }
    if (typeof renderApp === "function") renderApp();
  } catch (err) {
    console.warn("Avviso inizializzazione SQLite Wasm:", err);
    if (statusText) statusText.textContent = "SQLite 3: Fallback Array";
    if (statusDot) {
      statusDot.className = "text-amber-400 font-semibold";
      statusDot.textContent = "● Memoria RAM";
    }
    if (typeof initialSeedTenders !== "undefined") {
      window.fallbackTenders = [...initialSeedTenders];
    }
    if (typeof renderApp === "function") renderApp();
  }
}

function seedSQLiteDatabase(items) {
  if (!db) return;
  db.run("BEGIN TRANSACTION;");
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO gare (id, cig, category, region, source, authority, title, amount, deadline, status, owner, link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of items) {
    stmt.run([
      t.id || ("T_" + Math.random().toString(36).substr(2, 9)),
      (t.cig || "").toUpperCase(),
      t.category || "ALTRO",
      t.region || "Nazionale",
      t.source || "Manuale",
      t.authority || "",
      t.title || "",
      parseFloat(t.amount) || 0,
      t.deadline || "",
      t.status || "Da Valutare",
      t.owner || "",
      t.link || ""
    ]);
  }
  stmt.free();
  db.run("COMMIT;");
  persistWasmToLocalStorage();
}

function getAllTendersFromSQLite() {
  if (liveBackendConnected) {
    return liveTendersCache;
  }
  if (db) {
    const stmt = db.prepare("SELECT * FROM gare");
    const list = [];
    while (stmt.step()) {
      list.push(stmt.getAsObject());
    }
    stmt.free();
    return list;
  }
  return window.fallbackTenders || [];
}
