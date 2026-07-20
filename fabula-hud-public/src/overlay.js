import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import {
  BUFFS,
  DEFAULT_SETTINGS,
  STATUSES,
  characterLevel,
  characterName,
  escapeHtml,
  extractCharacters,
  initialsFor,
  normalizeSettings,
  numeric,
  pct,
  readSettings
} from "./shared.js";

const root = document.getElementById("hudRoot");

const state = {
  sceneReady: false,
  settings: { ...DEFAULT_SETTINGS },
  characters: []
};

boot();

async function boot() {
  await OBR.onReady(async () => {
    state.sceneReady = await OBR.scene.isReady();
    await refreshSettings();
    if (state.sceneReady) await refreshCharacters();
    render();

    OBR.room.onMetadataChange((metadata) => {
      state.settings = normalizeSettings(readSettings(metadata));
      render();
    });

    OBR.scene.onReadyChange(async (ready) => {
      state.sceneReady = ready;
      if (ready) await refreshCharacters();
      else state.characters = [];
      render();
    });

    OBR.scene.onMetadataChange((metadata) => {
      state.characters = extractCharacters(metadata, state.settings);
      render();
    });
  });
}

async function refreshSettings() {
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

function render() {
  root.className = `hudRoot ${state.settings.anchor} ${state.settings.density}`;
  root.style.setProperty("--hud-opacity", String(state.settings.opacity / 100));
  root.replaceChildren();

  if (!state.sceneReady || !state.characters.length) {
    return;
  }

  for (const character of state.characters) {
    const card = document.createElement("article");
    const hp = numeric(character.stats?.currentHP, 0);
    const maxHp = numeric(character.stats?.maxHP, hp || 1);
    card.className = [
      "hudCard",
      hp <= 0 ? "down" : "",
      hp > 0 && hp <= Math.ceil(maxHp / 2) ? "crisis" : ""
    ].filter(Boolean).join(" ");
    card.innerHTML = characterCard(character);
    const image = card.querySelector("img");
    if (image) {
      image.addEventListener("error", () => {
        image.replaceWith(document.createTextNode(initialsFor(characterName(character))));
      });
    }
    root.append(card);
  }
}

function characterCard(character) {
  const name = characterName(character);
  const avatar = character.traits?.avatar || "";
  const hp = numeric(character.stats?.currentHP, 0);
  const maxHp = numeric(character.stats?.maxHP, hp || 1);
  return `
    <div class="hudAvatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="" />` : escapeHtml(initialsFor(name))}</div>
    <div>
      <div class="hudTop">
        <div class="hudName">${escapeHtml(name)}</div>
        <div class="miniPill">Lv ${escapeHtml(characterLevel(character))}</div>
        <div class="miniPill">FP ${escapeHtml(String(numeric(character.stats?.fabula, 0)))}</div>
      </div>
      ${resource("hp", "HP", hp, maxHp)}
      ${resource("mp", "MP", character.stats?.currentMP, character.stats?.maxMP)}
      ${resource("ip", "IP", character.stats?.currentIP, character.stats?.maxIP)}
      <div class="statusLine">
        ${statusChips(character)}
      </div>
    </div>
  `;
}

function resource(kind, label, current, max) {
  const currentValue = numeric(current, 0);
  const maxValue = Math.max(1, numeric(max, currentValue || 1));
  return `
    <div class="resource ${kind}">
      <label>${label}</label>
      <div class="track"><div class="fill" style="width:${pct(currentValue, maxValue)}%"></div></div>
      <div class="value">${escapeHtml(String(currentValue))}/${escapeHtml(String(maxValue))}</div>
    </div>
  `;
}

function statusChips(character) {
  const debuffs = STATUSES
    .filter(([key]) => Boolean(character.debuff?.[key]))
    .map(([key, label, title]) => `<span class="statusChip ${key}" title="${title}">${label}</span>`);
  const buffs = BUFFS
    .filter(([key]) => Boolean(character.buff?.[key]))
    .map(([, label, title]) => `<span class="statusChip buff" title="${title}">${label}</span>`);
  return [...debuffs, ...buffs].join("");
}
