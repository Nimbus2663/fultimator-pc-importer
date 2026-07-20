import {
  applyOverrides,
  convertFultimatorPC as baseConvertFultimatorPC,
  parseFultimatorInput
} from "./converter.js";

export { applyOverrides, parseFultimatorInput };

const ATTRIBUTES = {
  dexterity: "dex",
  insight: "ins",
  might: "mig",
  willpower: "wil",
  will: "wil",
  dex: "dex",
  ins: "ins",
  mig: "mig",
  wil: "wil"
};

const LABELS = {
  weapon_customization_defenseboost: "Defense Boost",
  weapon_customization_magicdefenseboost: "Magic Defense Boost",
  pilot_module_armor: "Armor Module",
  pilot_module_weapon: "Weapon Module",
  pilot_module_support: "Support Module",
  pilot_frame_exoskeleton: "Exoskeleton Frame"
};

export function convertFultimatorPC(source, options = {}) {
  const converted = baseConvertFultimatorPC(source, options);
  enhanceSkills(converted, source, options.compendium || {});
  enhancePilotModules(converted, source);
  return converted;
}

function enhanceSkills(converted, source, compendium) {
  converted.skills = Array.isArray(converted.skills) ? converted.skills : [];

  for (const cls of source.classes || []) {
    const clsName = className(cls);
    const clsLevel = classLevel(cls);
    const category = findOrCreateClassCategory(converted.skills, clsName, clsLevel);
    category.items = Array.isArray(category.items) ? category.items : [];
    const activeSkills = (cls.skills || []).filter((skill) => skillCurrentLevel(skill) > 0);
    if (activeSkills.length) {
      category.items = category.items.filter((item) => !isClassPlaceholder(item, clsName));
    }

    for (const skill of activeSkills) {
      const current = skillCurrentLevel(skill);
      const name = skillName(skill);
      const detail = skillDetail(skill, compendium);
      const item = findOrCreateItem(category.items, name);
      item.name = name;
      item.info = `${current}/${skillMaxLevel(skill, current)}`;
      if (detail) item.detail = detail;
    }
  }
}

function enhancePilotModules(converted, source) {
  const modules = collectPilotModules(source);
  if (!modules.length) return;

  converted.skills = Array.isArray(converted.skills) ? converted.skills : [];
  converted.actions = Array.isArray(converted.actions) ? converted.actions : [];

  const category = findOrCreateCategory(converted.skills, "Pilot Modules", "Weapon / Armor / Support");
  category.items = Array.isArray(category.items) ? category.items : [];

  for (const entry of modules) {
    const item = {
      name: moduleDisplayName(entry.module),
      info: moduleInfo(entry.module, entry.vehicle),
      detail: moduleDetail(entry.module, entry.vehicle)
    };
    upsertUnique(category.items, item, (value) => normalizeLookup(value.name));

    const action = moduleAction(entry.module, entry.vehicle);
    if (action) {
      upsertUnique(converted.actions, action, (value) => normalizeLookup(value.name));
    }
  }
}

function findOrCreateCategory(categories, name, info) {
  const key = normalizeLookup(name);
  let category = categories.find((item) => normalizeLookup(item.categoryName) === key);
  if (!category) {
    category = { categoryName: name, categoryInfo: info, items: [], collapse: true };
    categories.push(category);
  }
  category.categoryName = name;
  category.categoryInfo = info;
  return category;
}

function findOrCreateClassCategory(categories, clsName, clsLevel) {
  const clsKey = normalizeLookup(clsName);
  let category = categories.find((item) => (
    normalizeLookup(item.categoryInfo) === "class"
    && normalizeLookup(String(item.categoryName || "").replace(/\s*lv\s*\d+\s*$/i, "")) === clsKey
  ));
  if (!category) {
    category = { categoryName: "", categoryInfo: "Class", items: [], collapse: true };
    categories.push(category);
  }
  category.categoryName = `${clsName} Lv ${clsLevel}`;
  category.categoryInfo = "Class";
  return category;
}

function findOrCreateItem(items, name) {
  const key = normalizeLookup(name);
  let item = items.find((entry) => normalizeLookup(entry.name) === key);
  if (!item) {
    item = items.find((entry) => normalizeLookup(entry.name) === "skill");
  }
  if (!item) {
    item = { name, info: "", detail: "" };
    items.push(item);
  }
  return item;
}

function isClassPlaceholder(item, clsName) {
  const name = normalizeLookup(item?.name);
  const info = String(item?.info || "").toLowerCase();
  return name === normalizeLookup(clsName) && info.startsWith("level");
}

function upsertUnique(list, next, keyFor) {
  const key = keyFor(next);
  const existing = list.find((item) => keyFor(item) === key);
  if (existing) {
    Object.assign(existing, next);
  } else {
    list.push(next);
  }
}

function skillDetail(skill, compendium = {}) {
  const rawDescription = cleanText(skill.description || skill.detail || skill.effect || "");
  const name = skillName(skill);
  const compendiumEntry = findCompendiumEntry(name, compendium);
  const description = firstRealDescription(skill, ["description", "detail", "effect", "text", "rules", "summary"]);
  const lines = [
    description || compendiumEntry?.description || compendiumEntry?.detail || "",
    compendiumEntry?.info ? `Info: ${cleanText(compendiumEntry.info)}` : "",
    !description && isFultimatorTranslationKey(rawDescription) && !(compendiumEntry?.description || compendiumEntry?.detail)
      ? `Compendium: search "${name || humanizeKey(rawDescription)}". Fultimator exported only the internal key ${rawDescription}.`
      : "",
    skill.specialSkill && cleanText(skill.specialSkill) !== name ? `Special: ${cleanText(skill.specialSkill)}` : ""
  ];
  return lines.filter(Boolean).join("\n");
}

function className(cls) {
  return cleanText(cls.name || cls.className || cls.characterClassName || "Class");
}

function classLevel(cls) {
  return number(firstNonBlank(cls.lvl, cls.level, cls.currentLevel, cls.currentLvl), 0);
}

function skillName(skill) {
  return cleanText(skill.skillName || skill.name || skill.displayName || skill.specialSkill || "Skill");
}

function skillCurrentLevel(skill) {
  return number(firstNonBlank(skill.currentLvl, skill.currentLevel, skill.lvl, skill.level, skill.rank, skill.currentRank), 0);
}

function skillMaxLevel(skill, fallback = 0) {
  return number(firstNonBlank(skill.maxLvl, skill.maxLevel, skill.max, skill.levels, skill.maxRank), fallback);
}

function collectPilotModules(source) {
  const modules = [];

  for (const vehicle of collectPilotVehicles(source)) {
    for (const module of collectModuleValues(vehicle)) {
      modules.push({ module, vehicle });
    }
  }

  for (const module of collectModuleValues(source)) {
    modules.push({ module, vehicle: null });
  }

  for (const cls of source.classes || []) {
    for (const module of collectModuleValues(cls)) {
      modules.push({ module, vehicle: null });
    }
  }

  for (const module of collectNestedPilotModules(source)) {
    modules.push({ module, vehicle: findOwningVehicle(source, module) });
  }

  const seen = new Set();
  return modules.filter(({ module, vehicle }) => {
    if (!isPotentialModule(module)) return false;
    const key = JSON.stringify([
      module.name,
      module.customName,
      module.displayName,
      module.moduleName,
      module.type,
      module.category,
      vehicle?.name,
      vehicle?.customName
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectPilotVehicles(source) {
  const vehicles = [];
  for (const key of ["vehicles", "pilotVehicles", "pilotVehicle"]) {
    const value = source?.[key];
    if (Array.isArray(value)) vehicles.push(...value);
    else if (value && typeof value === "object") vehicles.push(value);
  }
  for (const cls of source.classes || []) {
    const value = cls.vehicles;
    if (Array.isArray(value)) vehicles.push(...value);
    else if (value && typeof value === "object") vehicles.push(value);
  }
  return vehicles.filter((vehicle) => vehicle && typeof vehicle === "object");
}

function collectModuleValues(container) {
  if (!container || typeof container !== "object") return [];
  const values = [];
  for (const key of [
    "modules",
    "module",
    "pilotModules",
    "vehicleModules",
    "enabledModules",
    "selectedModules",
    "supportModules",
    "weaponModules",
    "armorModules"
  ]) {
    const value = container[key];
    if (Array.isArray(value)) values.push(...value);
    else if (value && typeof value === "object") values.push(...Object.values(value));
  }
  return values.filter((value) => value && typeof value === "object");
}

function collectNestedPilotModules(source) {
  const found = [];
  const visited = new WeakSet();

  function visit(value, path = [], depth = 0) {
    if (!value || typeof value !== "object" || depth > 8 || visited.has(value)) return;
    visited.add(value);

    if (isPotentialModule(value) && isPilotModuleContext(value, path)) {
      found.push(value);
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)], depth + 1));
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (!shouldSkipModuleScanKey(key)) visit(child, [...path, key], depth + 1);
    }
  }

  visit(source);
  return found;
}

function isPilotModuleContext(value, path) {
  const pathText = path.join(".").toLowerCase();
  const objectText = [
    value.name,
    value.customName,
    value.displayName,
    value.moduleName,
    value.type,
    value.category,
    value.moduleType,
    value.dataType
  ].map((item) => String(item || "").toLowerCase()).join(" ");

  return pathText.includes("module")
    || objectText.includes("module")
    || objectText.includes("pilot_")
    || objectText.includes("support")
    || objectText.includes("vehicle");
}

function shouldSkipModuleScanKey(key) {
  return [
    "skills",
    "spells",
    "weapons",
    "customWeapons",
    "armor",
    "shields",
    "accessories",
    "notes",
    "info",
    "attributes",
    "statuses",
    "modifiers"
  ].includes(key);
}

function findOwningVehicle(source, module) {
  for (const vehicle of collectPilotVehicles(source)) {
    if (collectModuleValues(vehicle).includes(module)) return vehicle;
  }
  return null;
}

function isPotentialModule(value) {
  return Boolean(value && typeof value === "object" && (
    value.name
    || value.customName
    || value.displayName
    || value.moduleName
    || value.type
    || value.category
    || value.equippedSlot
    || value.isComplex !== undefined
    || value.accuracyCheck
    || value.selectedAccuracyCheck
    || value.attackCheck
    || value.damage !== undefined
    || value.damageModifier !== undefined
    || value.description
    || value.effect
  ));
}

function moduleAction(module, vehicle) {
  const acc = module.accuracyCheck || module.selectedAccuracyCheck || module.check || module.attackCheck || {};
  const hasCheck = Boolean(acc.att1 || acc.att2 || acc.attributeOne || acc.attributeTwo || module.attr1 || module.attr2 || module.attributeOne || module.attributeTwo);
  const hasDamage = module.damage !== undefined
    || module.damageModifier !== undefined
    || module.selectedDamageModifier !== undefined
    || module.baseDamage !== undefined;

  if (!moduleWeaponLike(module) || (!hasCheck && !hasDamage)) return null;

  const diceOne = attrKey(acc.att1 || acc.attributeOne || module.attr1 || module.attributeOne);
  const diceTwo = attrKey(acc.att2 || acc.attributeTwo || module.attr2 || module.attributeTwo);
  const bonus = number(module.precModifier ?? module.accuracyModifier ?? module.bonus, 0);
  const damage = moduleDamage(module);
  const vehicleName = vehicle ? cleanText(vehicle.customName || vehicle.name || "") : "";
  const name = [vehicleName, moduleDisplayName(module)].filter(Boolean).join(": ") || "Pilot Module";

  return {
    name,
    info: `${formatDicePair(diceOne, diceTwo)}${bonus ? ` + ${bonus}` : ""} | HR + ${damage} ${moduleDamageType(module)}`,
    detail: moduleDetail(module, vehicle),
    diceOne,
    diceTwo,
    bonus,
    damage,
    useHR: true
  };
}

function moduleWeaponLike(module) {
  const text = [
    module.name,
    module.customName,
    module.displayName,
    module.moduleName,
    module.type,
    module.category,
    module.dataType
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return text.includes("weapon")
    || Boolean(module.accuracyCheck || module.selectedAccuracyCheck || module.attackCheck)
    || module.damage !== undefined
    || module.damageModifier !== undefined
    || module.selectedDamageModifier !== undefined;
}

function moduleInfo(module, vehicle) {
  return [
    `[${moduleEnabled(module) ? "ON" : "OFF"}]`,
    moduleType(module),
    vehicle ? `Vehicle: ${cleanText(vehicle.customName || vehicle.name || "Vehicle")}` : "",
    module.equippedSlot ? `Slot: ${module.equippedSlot}` : "",
    module.isComplex ? "Complex" : "",
    module.cost ? `${module.cost} z` : "",
    module.defModifier ? `DEF ${signed(number(module.defModifier, 0))}` : "",
    module.mDefModifier ? `M.DEF ${signed(number(module.mDefModifier, 0))}` : "",
    module.initModifier ? `Init ${signed(number(module.initModifier, 0))}` : ""
  ].filter(Boolean).join(" | ");
}

function moduleDetail(module, vehicle) {
  const acc = module.accuracyCheck || module.selectedAccuracyCheck || module.check || module.attackCheck || {};
  const firstAttr = acc.att1 || acc.attributeOne || module.attr1 || module.attributeOne;
  const secondAttr = acc.att2 || acc.attributeTwo || module.attr2 || module.attributeTwo;
  return [
    vehicle ? `Vehicle: ${cleanText(vehicle.customName || vehicle.name || "Vehicle")}` : "",
    moduleType(module) ? `Type: ${moduleType(module)}` : "",
    module.equippedSlot ? `Slot: ${module.equippedSlot}` : "",
    firstAttr || secondAttr ? `Check: ${formatDicePair(attrKey(firstAttr), attrKey(secondAttr))}` : "",
    moduleWeaponLike(module) ? `Damage: HR + ${moduleDamage(module)} ${moduleDamageType(module)}` : "",
    module.range || module.selectedRange ? `Range: ${humanizeKey(module.range || module.selectedRange)}` : "",
    module.isComplex ? "Complex module" : "",
    moduleEffect(module)
  ].filter(Boolean).join("\n");
}

function moduleDisplayName(module) {
  return cleanText(module.customName || module.displayName || module.moduleName || humanizeKey(module.name || "Module"));
}

function moduleType(module) {
  return humanizeKey(module.type || module.category || module.moduleType || "");
}

function moduleEnabled(module) {
  return Boolean(module.equipped || module.isEquipped || module.enabled || module.active || module.selected);
}

function moduleEffect(module) {
  const description = firstRealDescription(module, ["description", "effect", "quality", "detail", "rules", "summary"]);
  if (description) return description;
  const key = cleanText(module.description || module.effect || "");
  return isFultimatorTranslationKey(key) ? `Compendium: search "${moduleDisplayName(module)}". Fultimator exported only ${key}.` : "";
}

function moduleDamage(module) {
  if (module.damage !== undefined) return number(module.damage, 10);
  if (module.baseDamage !== undefined) return number(module.baseDamage, 10) + number(module.damageModifier, 0);
  return 10 + number(module.damageModifier ?? module.selectedDamageModifier, 0);
}

function moduleDamageType(module) {
  return humanizeKey(module.damageType || module.selectedType || module.customDamageType || module.element || "physical").toLowerCase();
}

function firstRealDescription(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" || typeof value === "number") {
      const text = cleanDescription(value);
      if (text) return text;
    }
    if (Array.isArray(value)) {
      const text = value.map((item) => cleanDescription(item)).filter(Boolean).join("\n");
      if (text) return text;
    }
  }
  return "";
}

function findCompendiumEntry(name, compendium) {
  const key = normalizeLookup(name);
  if (!key || !compendium || typeof compendium !== "object") return null;
  return compendium[key] || compendium[cleanText(name)] || null;
}

function cleanDescription(value) {
  const text = cleanText(value || "").trim();
  return !text || isFultimatorTranslationKey(text) ? "" : text;
}

function isFultimatorTranslationKey(value) {
  return /^[A-Za-z][A-Za-z0-9]*_desc$/.test(value)
    || /^weapon_[a-z0-9_]+_(effect|desc)$/.test(value)
    || /^[a-z]+_[a-z0-9_]+_(effect|desc)$/.test(value);
}

function formatDicePair(first, second) {
  return `${first.toUpperCase()} + ${second.toUpperCase()}`;
}

function attrKey(value) {
  return ATTRIBUTES[String(value || "").toLowerCase()] || "dex";
}

function humanizeKey(value) {
  const raw = cleanText(value || "");
  if (LABELS[raw]) return LABELS[raw];
  return raw
    .replace(/^weapon_(category|range|customization)_/, "")
    .replace(/^pilot_(module|frame)_/, "")
    .replace(/^weapon_/, "")
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function signed(value) {
  const numeric = number(value, 0);
  return numeric >= 0 ? `+${numeric}` : String(numeric);
}

function normalizeLookup(value) {
  return cleanText(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

function firstNonBlank(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
