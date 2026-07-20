export const ULTIMATE_STORY_KEY = "ultimate.story.extension/metadata";
export const HUD_SETTINGS_KEY = "fabula.scene.hud/settings";
export const HUD_OVERLAY_ID = "fabula.scene.hud/overlay";

export const DEFAULT_SETTINGS = {
  anchor: "bottom-left",
  density: "standard",
  style: "phantom",
  opacity: 88,
  showDown: true
};

export const STATUSES = [
  ["slow", "~", "Slow"],
  ["dazed", "?", "Dazed"],
  ["weak", "-", "Weak"],
  ["shaken", "!", "Shaken"],
  ["enraged", "+", "Enraged"],
  ["poisoned", "x", "Poisoned"]
];

export const BUFFS = [
  ["dex", "DX+", "DEX Up"],
  ["ins", "IN+", "INS Up"],
  ["mig", "MG+", "MIG Up"],
  ["wil", "WL+", "WIL Up"]
];

export function extractCharacters(metadata, settings = DEFAULT_SETTINGS) {
  const characters = metadata?.[ULTIMATE_STORY_KEY];
  if (!characters || typeof characters !== "object") return [];
  return Object.values(characters)
    .filter((character) => character && !character.isGMPlayer)
    .filter((character) => settings.showDown || numeric(character.stats?.currentHP, 0) > 0)
    .sort((a, b) => String(a.traits?.name || a.name || "").localeCompare(String(b.traits?.name || b.name || "")));
}

export function readSettings(metadata) {
  return {
    ...DEFAULT_SETTINGS,
    ...(metadata?.[HUD_SETTINGS_KEY] && typeof metadata[HUD_SETTINGS_KEY] === "object" ? metadata[HUD_SETTINGS_KEY] : {})
  };
}

export function normalizeSettings(settings) {
  return {
    anchor: ["bottom-left", "bottom-center", "top-left", "top-right"].includes(settings.anchor) ? settings.anchor : DEFAULT_SETTINGS.anchor,
    density: ["standard", "compact", "theatre"].includes(settings.density) ? settings.density : DEFAULT_SETTINGS.density,
    style: ["clean", "phantom"].includes(settings.style) ? settings.style : DEFAULT_SETTINGS.style,
    opacity: Math.max(60, Math.min(100, numeric(settings.opacity, DEFAULT_SETTINGS.opacity))),
    showDown: settings.showDown !== false
  };
}

export function initialsFor(name) {
  const parts = String(name || "PJ").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "PJ";
}

export function pct(current, max) {
  const safeMax = Math.max(1, numeric(max, current || 1));
  return Math.max(0, Math.min(100, Math.round((numeric(current, 0) / safeMax) * 100)));
}

export function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function characterName(character) {
  return character.traits?.name || character.name || "Unnamed";
}

export function characterLevel(character) {
  return character.level || character.traits?.level || "";
}
