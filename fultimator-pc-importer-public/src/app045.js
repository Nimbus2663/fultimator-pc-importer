import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import { applyOverrides, convertFultimatorPC, parseFultimatorInput } from "./converter.js";

const ULTIMATE_STORY_KEY = "ultimate.story.extension/metadata";

const state = {
  sceneReady: false,
  converted: [],
  overrides: new Map(),
  sceneCharacters: []
};

const els = {
  sceneStatus: document.getElementById("sceneStatus"),
  fileInput: document.getElementById("fileInput"),
  messageBox: document.getElementById("messageBox"),
  jsonInput: document.getElementById("jsonInput"),
  parseButton: document.getElementById("parseButton"),
  clearButton: document.getElementById("clearButton"),
  previewPanel: document.getElementById("previewPanel"),
  previewList: document.getElementById("previewList"),
  countLabel: document.getElementById("countLabel"),
  includeDetails: document.getElementById("includeDetails"),
  importButton: document.getElementById("importButton"),
  copyButton: document.getElementById("copyButton"),
  downloadButton: document.getElementById("downloadButton"),
  trackerPanel: document.getElementById("trackerPanel"),
  trackerList: document.getElementById("trackerList"),
  trackerCount: document.getElementById("trackerCount"),
  toast: document.getElementById("toast")
};

bindEvents();
boot();

async function boot() {
  try {
    await OBR.onReady(async () => {
      state.sceneReady = await OBR.scene.isReady();
      updateSceneStatus();
      if (state.sceneReady) await refreshSceneCharacters();

      OBR.scene.onReadyChange(async (ready) => {
        state.sceneReady = ready;
        updateSceneStatus();
        if (ready) await refreshSceneCharacters();
        else setSceneCharacters([]);
      });

      OBR.scene.onMetadataChange((metadata) => {
        setSceneCharacters(extractSceneCharacters(metadata));
      });
    });
  } catch (error) {
    state.sceneReady = false;
    els.sceneStatus.textContent = "Modo preview";
    els.sceneStatus.className = "pill warn";
    setMessage(`No pude conectar con Owlbear: ${error.message || error}`, "warn");
  }
}

function bindEvents() {
  els.fileInput.addEventListener("change", onFilesSelected);
  els.parseButton.addEventListener("click", parseAndPreview);
  els.clearButton.addEventListener("click", clearAll);
  els.includeDetails.addEventListener("change", parseAndPreview);
  els.importButton.addEventListener("click", importToScene);
  els.copyButton.addEventListener("click", copyConverted);
  els.downloadButton.addEventListener("click", downloadConverted);
  syncImportButton();
}

async function onFilesSelected(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    setMessage("No elegiste ningun archivo.", "warn");
    return;
  }

  try {
    setMessage(`Leyendo ${files.length} archivo(s)...`, "info");
    const characters = [];
    for (const file of files) {
      const text = await file.text();
      const parsed = parseFultimatorInput(text);
      if (!parsed.length) throw new Error(`${file.name}: no encontre ningun PJ.`);
      characters.push(...parsed);
    }
    els.jsonInput.value = JSON.stringify(characters.length === 1 ? characters[0] : characters, null, 2);
    parseAndPreview();
  } catch (error) {
    state.converted = [];
    renderPreview();
    showToast(error.message || "No pude leer ese JSON.", "error");
  } finally {
    els.fileInput.value = "";
  }
}

function parseAndPreview() {
  try {
    const raw = els.jsonInput.value.trim();
    if (!raw) throw new Error("Pega o elige un JSON de PJ de Fultimator primero.");

    const sources = parseFultimatorInput(raw);
    if (!sources.length) throw new Error("No encontre personajes en el texto.");

    state.converted = sources.map((source) => convertFultimatorPC(source, {
      includeDetails: els.includeDetails.checked
    }));
    state.overrides.clear();
    renderPreview();

    const next = state.sceneReady
      ? "Ahora pulsa 2. Importar a escena."
      : "La escena aun no aparece lista; espera un segundo o reabre la extension.";
    showToast(`Listo: ${state.converted.length} PJ detectado(s). ${next}`, state.sceneReady ? "success" : "warn");
  } catch (error) {
    state.converted = [];
    renderPreview();
    showToast(error.message || "No pude leer ese JSON.", "error");
  }
}

function renderPreview() {
  els.previewList.replaceChildren();
  els.countLabel.textContent = state.converted.length ? `${state.converted.length} PJ` : "";
  els.previewPanel.classList.toggle("hidden", state.converted.length === 0);
  syncImportButton();

  for (const character of state.converted) {
    const current = applyOverrides(character, state.overrides.get(character.id) || {});
    const card = document.createElement("article");
    card.className = "characterCard";
    card.dataset.id = String(character.id);
    card.innerHTML = `
      <div class="characterTop">
        <strong>${escapeHtml(current.traits.name)}</strong>
        <span class="pill">Lv ${escapeHtml(String(current.level))}</span>
      </div>
      <div class="meta">${escapeHtml(current.traits.identity || "Sin identidad")} - ${escapeHtml(current.traits.theme || "Sin tema")} - ${escapeHtml(current.traits.origin || "Sin origen")}</div>
      <div class="grid">
        ${statInput("currentHP", "HP", current.stats.currentHP, current.stats.maxHP)}
        ${statInput("currentMP", "MP", current.stats.currentMP, current.stats.maxMP)}
        ${statInput("currentIP", "IP", current.stats.currentIP, current.stats.maxIP)}
        ${statInput("defense", "DEF", current.stats.defense)}
        ${statInput("mDefense", "M.DEF", current.stats.mDefense)}
        ${statInput("fabula", "FP", current.stats.fabula)}
      </div>
    `;
    card.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => updateOverride(character.id, input.name, input.value));
    });
    els.previewList.append(card);
  }
}

function statInput(name, label, value) {
  return `<div class="stat"><span>${label}</span><input name="${name}" value="${escapeHtml(String(value))}" aria-label="${label}" /></div>`;
}

function updateOverride(id, key, value) {
  const overrides = state.overrides.get(id) || {};
  overrides[key] = value;
  state.overrides.set(id, overrides);
}

function getFinalCharacters() {
  return state.converted.map((character) => applyOverrides(character, state.overrides.get(character.id) || {}));
}

async function importToScene() {
  const characters = getFinalCharacters();
  if (!characters.length) {
    showToast("Primero elige o pega un JSON y revisa la previsualizacion.", "warn");
    return;
  }
  if (!state.sceneReady) {
    showToast("Abre una escena de Owlbear antes de importar.", "warn");
    return;
  }

  try {
    els.importButton.disabled = true;
    setMessage("Escribiendo personaje(s) en la escena...", "info");
    const metadata = await OBR.scene.getMetadata();
    const existing = metadata[ULTIMATE_STORY_KEY] && typeof metadata[ULTIMATE_STORY_KEY] === "object"
      ? { ...metadata[ULTIMATE_STORY_KEY] }
      : {};

    for (const character of characters) {
      const previousKey = findExistingCharacterKey(existing, character.traits.name);
      const key = previousKey || String(character.id);
      const previous = previousKey ? existing[previousKey] : null;
      existing[key] = {
        ...character,
        id: normalizeId(key, character.id),
        lastEdit: newEditId(),
        linkedStats: previous?.linkedStats || character.linkedStats
      };
    }

    await OBR.scene.setMetadata({ [ULTIMATE_STORY_KEY]: existing });
    setSceneCharacters(Object.values(existing).filter((character) => character && !character.isGMPlayer));
    try {
      await OBR.notification.show(`Importado: ${characters.map((c) => c.traits.name).join(", ")}`);
    } catch {
      // The panel message is enough if browser notifications are unavailable.
    }
    showToast("Importado a la escena. Abre Ultimate Story y pulsa Save si quieres guardarlo.", "success");
  } catch (error) {
    showToast(error.message || "No pude escribir en la escena.", "error");
  } finally {
    syncImportButton();
  }
}

async function refreshSceneCharacters() {
  try {
    const metadata = await OBR.scene.getMetadata();
    setSceneCharacters(extractSceneCharacters(metadata));
  } catch {
    setSceneCharacters([]);
  }
}

function extractSceneCharacters(metadata) {
  const characters = metadata?.[ULTIMATE_STORY_KEY];
  if (!characters || typeof characters !== "object") return [];
  return Object.values(characters)
    .filter((character) => character && !character.isGMPlayer)
    .sort((a, b) => String(a.traits?.name || a.name || "").localeCompare(String(b.traits?.name || b.name || "")));
}

function setSceneCharacters(characters) {
  state.sceneCharacters = characters;
  renderTracker();
}

function renderTracker() {
  els.trackerList.replaceChildren();
  els.trackerPanel.classList.toggle("hidden", state.sceneCharacters.length === 0);
  els.trackerCount.textContent = state.sceneCharacters.length ? `${state.sceneCharacters.length} PJ` : "";

  for (const character of state.sceneCharacters) {
    const card = document.createElement("article");
    card.className = "trackerCard";
    const name = character.traits?.name || character.name || "PJ";
    card.innerHTML = `
      <div class="avatar">${escapeHtml(initialsFor(name))}</div>
      <div>
        <div class="trackerHead">
          <strong>${escapeHtml(name)}</strong>
          <span class="pill">Lv ${escapeHtml(String(character.level || character.traits?.level || ""))}</span>
        </div>
        <div class="resourceRows">
          ${resourceRow(character, "currentHP", "maxHP", "HP", "hp")}
          ${resourceRow(character, "currentMP", "maxMP", "MP", "mp")}
          ${resourceRow(character, "currentIP", "maxIP", "IP", "ip")}
        </div>
        <div class="trackerStats">
          <span class="miniStat">DEF ${escapeHtml(String(character.stats?.defense ?? ""))}</span>
          <span class="miniStat">M.DEF ${escapeHtml(String(character.stats?.mDefense ?? ""))}</span>
          <span class="miniStat">FP ${escapeHtml(String(character.stats?.fabula ?? 0))}</span>
        </div>
      </div>
    `;
    els.trackerList.append(card);
  }
}

function resourceRow(character, currentKey, maxKey, label, className) {
  const current = numeric(character.stats?.[currentKey], 0);
  const max = Math.max(1, numeric(character.stats?.[maxKey], current || 1));
  const pct = Math.max(0, Math.min(100, Math.round((current / max) * 100)));
  return `
    <div class="resourceRow">
      <label>${label}</label>
      <div class="bar ${className}"><div class="barFill" style="width:${pct}%"></div></div>
      <input value="${escapeHtml(String(current))}" readonly aria-label="${label}" title="${label}: ${current}/${max}" />
    </div>
  `;
}

async function copyConverted() {
  const characters = getFinalCharacters();
  if (!characters.length) {
    showToast("No hay JSON convertido.", "warn");
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(characters.length === 1 ? characters[0] : characters, null, 2));
  showToast("JSON convertido copiado.", "success");
}

function downloadConverted() {
  const characters = getFinalCharacters();
  if (!characters.length) {
    showToast("No hay JSON convertido.", "warn");
    return;
  }
  const output = characters.length === 1 ? characters[0] : characters;
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = characters.length === 1
    ? `${slug(characters[0].traits.name)}-ultimate-story.json`
    : "ultimate-story-characters.json";
  link.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  els.fileInput.value = "";
  els.jsonInput.value = "";
  state.converted = [];
  state.overrides.clear();
  renderPreview();
  setMessage("Limpio. Elige un JSON de PJ de Fultimator para empezar.", "info");
}

function updateSceneStatus() {
  if (state.sceneReady) {
    els.sceneStatus.textContent = "Escena lista";
    els.sceneStatus.className = "pill ready";
  } else {
    els.sceneStatus.textContent = "Sin escena abierta";
    els.sceneStatus.className = "pill warn";
  }
  syncImportButton();
}

function syncImportButton() {
  if (!els.importButton) return;
  els.importButton.disabled = !state.sceneReady || state.converted.length === 0;
}

function findExistingCharacterKey(existing, name) {
  const target = normalizeName(name);
  if (!target) return "";
  for (const [key, character] of Object.entries(existing)) {
    if (character?.isGMPlayer) continue;
    if (normalizeName(character?.traits?.name || character?.name) === target) return key;
  }
  return "";
}

function normalizeId(key, fallback) {
  const numeric = Number(key);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function initialsFor(name) {
  return String(name || "PJ").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "PJ";
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function showToast(message, type = "info") {
  setMessage(message, type);
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  els.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => els.toast.classList.add("hidden"), 3200);
}

function setMessage(message, type = "info") {
  els.messageBox.textContent = message;
  els.messageBox.className = `message ${type}`;
}

function newEditId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now());
}

function slug(value) {
  return String(value || "character").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "character";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
