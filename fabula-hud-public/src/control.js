import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import {
  DEFAULT_SETTINGS,
  HUD_MODAL_ID,
  HUD_SETTINGS_KEY,
  STATUSES,
  ULTIMATE_STORY_KEY,
  characterLevel,
  characterName,
  escapeHtml,
  extractCharacters,
  initialsFor,
  normalizeSettings,
  numeric,
  readSettings
} from "./shared.js";

const state = {
  sceneReady: false,
  settings: { ...DEFAULT_SETTINGS },
  characters: []
};

const els = {
  sceneStatus: document.getElementById("sceneStatus"),
  openHud: document.getElementById("openHud"),
  closeHud: document.getElementById("closeHud"),
  anchor: document.getElementById("anchor"),
  density: document.getElementById("density"),
  opacity: document.getElementById("opacity"),
  showDown: document.getElementById("showDown"),
  characterList: document.getElementById("characterList"),
  countLabel: document.getElementById("countLabel"),
  toast: document.getElementById("toast")
};

boot();

async function boot() {
  bindEvents();
  await OBR.onReady(async () => {
    state.sceneReady = await OBR.scene.isReady();
    await refreshRoomSettings();
    if (state.sceneReady) await refreshCharacters();
    updateSceneStatus();
    syncSettingsInputs();
    renderCharacters();

    OBR.room.onMetadataChange((metadata) => {
      state.settings = normalizeSettings(readSettings(metadata));
      syncSettingsInputs();
    });

    OBR.scene.onReadyChange(async (ready) => {
      state.sceneReady = ready;
      updateSceneStatus();
      if (ready) await refreshCharacters();
      else {
        state.characters = [];
        renderCharacters();
      }
    });

    OBR.scene.onMetadataChange((metadata) => {
      state.characters = extractCharacters(metadata, state.settings);
      renderCharacters();
    });
  });
}

function bindEvents() {
  els.openHud.addEventListener("click", openHud);
  els.closeHud.addEventListener("click", closeHud);
  for (const input of [els.anchor, els.density, els.opacity, els.showDown]) {
    input.addEventListener("change", saveSettingsFromInputs);
    input.addEventListener("input", saveSettingsFromInputs);
  }
}

async function openHud() {
  await OBR.modal.open({
    id: HUD_MODAL_ID,
    url: new URL("../overlay.html", import.meta.url).href,
    fullScreen: true,
    hideBackdrop: true,
    hidePaper: true,
    disablePointerEvents: true
  });
  showToast("HUD abierto.");
}

async function closeHud() {
  try {
    await OBR.modal.close(HUD_MODAL_ID);
  } catch {
    // Already closed.
  }
  showToast("HUD cerrado.");
}

async function refreshRoomSettings() {
  try {
    const metadata = await OBR.room.getMetadata();
    state.settings = normalizeSettings(readSettings(metadata));
  } catch {
    state.settings = { ...DEFAULT_SETTINGS };
  }
}

async function refreshCharacters() {
  try {
    const metadata = await OBR.scene.getMetadata();
    state.characters = extractCharacters(metadata, state.settings);
  } catch {
    state.characters = [];
  }
}

function updateSceneStatus() {
  els.sceneStatus.textContent = state.sceneReady ? "Escena lista" : "Sin escena";
  els.sceneStatus.className = `pill ${state.sceneReady ? "ready" : "warn"}`;
  els.openHud.disabled = !state.sceneReady;
}

function syncSettingsInputs() {
  els.anchor.value = state.settings.anchor;
  els.density.value = state.settings.density;
  els.opacity.value = String(state.settings.opacity);
  els.showDown.checked = state.settings.showDown;
}

async function saveSettingsFromInputs() {
  state.settings = normalizeSettings({
    anchor: els.anchor.value,
    density: els.density.value,
    opacity: els.opacity.value,
    showDown: els.showDown.checked
  });
  try {
    await OBR.room.setMetadata({ [HUD_SETTINGS_KEY]: state.settings });
  } catch {
    showToast("No pude guardar ajustes.");
  }
  await refreshCharacters();
  renderCharacters();
}

function renderCharacters() {
  els.characterList.replaceChildren();
  els.countLabel.textContent = state.characters.length ? `${state.characters.length} PJ` : "0 PJ";

  for (const character of state.characters) {
    const card = document.createElement("article");
    card.className = "editorCard";
    card.dataset.id = String(character.id);
    const avatar = character.traits?.avatar || "";
    const name = characterName(character);
    card.innerHTML = `
      <div class="editorAvatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="" />` : escapeHtml(initialsFor(name))}</div>
      <div>
        <div class="editorTop">
          <strong>${escapeHtml(name)}</strong>
          <span class="pill">Lv ${escapeHtml(characterLevel(character))}</span>
        </div>
        <div class="editorGrid">
          ${numberInput("currentHP", "HP", character.stats?.currentHP)}
          ${numberInput("currentMP", "MP", character.stats?.currentMP)}
          ${numberInput("currentIP", "IP", character.stats?.currentIP)}
          ${numberInput("fabula", "FP", character.stats?.fabula)}
          ${numberInput("defense", "DEF", character.stats?.defense)}
          ${numberInput("mDefense", "M.DEF", character.stats?.mDefense)}
        </div>
        <label style="margin-top:8px">
          Avatar URL
          <input data-avatar value="${escapeHtml(avatar)}" placeholder="https://..." />
        </label>
        <div class="statusEditor">
          ${statusButtons(character)}
        </div>
      </div>
    `;

    const image = card.querySelector("img");
    if (image) {
      image.addEventListener("error", () => {
        image.replaceWith(document.createTextNode(initialsFor(name)));
      });
    }

    card.querySelectorAll("[data-stat]").forEach((input) => {
      input.addEventListener("change", () => updateCharacterStat(character.id, input.dataset.stat, input.value));
    });
    card.querySelector("[data-avatar]").addEventListener("change", (event) => updateCharacterAvatar(character.id, event.target.value));
    card.querySelectorAll("[data-status]").forEach((button) => {
      button.addEventListener("click", () => toggleStatus(character.id, button.dataset.status));
    });
    els.characterList.append(card);
  }
}

function numberInput(key, label, value) {
  return `
    <label>
      ${label}
      <input data-stat="${key}" type="number" value="${escapeHtml(String(numeric(value, 0)))}" />
    </label>
  `;
}

function statusButtons(character) {
  return STATUSES.map(([key, label, title]) => {
    const active = Boolean(character.debuff?.[key]);
    return `<button type="button" class="${active ? "active" : ""}" data-status="${key}" title="${title}">${label}</button>`;
  }).join("");
}

async function updateCharacterStat(id, stat, value) {
  await updateCharacter(id, (character) => {
    character.stats = character.stats || {};
    character.stats[stat] = numeric(value, character.stats[stat] || 0);
  });
}

async function updateCharacterAvatar(id, avatar) {
  await updateCharacter(id, (character) => {
    character.traits = character.traits || {};
    character.traits.avatar = String(avatar || "").trim();
  });
}

async function toggleStatus(id, status) {
  await updateCharacter(id, (character) => {
    character.debuff = character.debuff || {};
    character.debuff[status] = !character.debuff[status];
  });
}

async function updateCharacter(id, mutate) {
  if (!state.sceneReady) return;
  const metadata = await OBR.scene.getMetadata();
  const existing = metadata?.[ULTIMATE_STORY_KEY] && typeof metadata[ULTIMATE_STORY_KEY] === "object"
    ? { ...metadata[ULTIMATE_STORY_KEY] }
    : {};
  const key = findCharacterKey(existing, id);
  if (!key) return;
  const character = { ...existing[key] };
  mutate(character);
  character.lastEdit = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now());
  existing[key] = character;
  await OBR.scene.setMetadata({ [ULTIMATE_STORY_KEY]: existing });
  state.characters = extractCharacters({ [ULTIMATE_STORY_KEY]: existing }, state.settings);
  renderCharacters();
}

function findCharacterKey(existing, id) {
  const target = String(id);
  for (const [key, character] of Object.entries(existing)) {
    if (String(key) === target || String(character?.id) === target) return key;
  }
  return "";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => els.toast.classList.add("hidden"), 2200);
}
