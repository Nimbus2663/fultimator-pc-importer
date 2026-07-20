import {
  applyOverrides,
  convertFultimatorPC as convertFultimatorPC048,
  parseFultimatorInput
} from "./converter048.js";

export { applyOverrides, parseFultimatorInput };

const ATTRS = {
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

export function convertFultimatorPC(source, options = {}) {
  const converted = convertFultimatorPC048(source, options);
  enhancePilotFromSpellExports(converted, source);
  enhanceMutantFromSpellExports(converted, source);
  removeEmptySpellCategories(converted.skills);
  return converted;
}

function enhancePilotFromSpellExports(converted, source) {
  const modules = collectPilotModules(source);
  if (!modules.length) return;

  converted.skills = Array.isArray(converted.skills) ? converted.skills : [];
  converted.actions = Array.isArray(converted.actions) ? converted.actions : [];

  const names = new Set(modules.map((entry) => key(moduleName(entry.module))));
  removeSpellItems(converted.skills, names);
  removeActions(converted.actions, names);

  const category = findOrCreateCategory(converted.skills, "Pilot Modules", "Weapon / Armor / Support");
  category.items = Array.isArray(category.items) ? category.items : [];

  for (const entry of modules) {
    upsert(category.items, {
      name: moduleName(entry.module),
      info: moduleInfo(entry.module, entry.vehicle),
      detail: moduleDetail(entry.module, entry.vehicle)
    });

    const action = moduleAction(entry.module, entry.vehicle);
    if (action) upsert(converted.actions, action);
  }
}

function enhanceMutantFromSpellExports(converted, source) {
  const forms = collectMutantForms(source);
  if (!forms.length) return;

  converted.skills = Array.isArray(converted.skills) ? converted.skills : [];
  const names = new Set(forms.map((form) => key(formName(form))));
  removeSpellItems(converted.skills, names);
  removeActions(converted.actions || [], names);

  const category = findOrCreateCategory(converted.skills, "Mutant Therioforms", "Therioforms");
  category.items = Array.isArray(category.items) ? category.items : [];

  for (const form of forms) {
    upsert(category.items, {
      name: formName(form),
      info: formInfo(form),
      detail: formDetail(form)
    });
  }
}

function collectPilotModules(source) {
  const entries = [];
  for (const cls of source?.classes || []) {
    if (!key(className(cls)).includes("pilot")) continue;
    for (const vehicle of collectVehicles(cls)) {
      for (const module of directModules(vehicle)) {
        entries.push({ module, vehicle });
      }
    }
    for (const module of collectNested(cls, (value, path) => looksLikeModule(value, path))) {
      entries.push({ module, vehicle: findVehicleForModule(cls, module) });
    }
  }
  const seen = new Set();
  return entries.filter(({ module, vehicle }) => {
    if (!module || typeof module !== "object" || looksLikeVehicle(module)) return false;
    const id = key([moduleName(module), vehicle && vehicleName(vehicle), textOf(module)].join("|"));
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function collectMutantForms(source) {
  const forms = [];
  for (const cls of source?.classes || []) {
    if (!key(className(cls)).includes("mutant")) continue;
    forms.push(...collectNested(cls, (value, path) => looksLikeTherioform(value, path)));
  }
  const seen = new Set();
  return forms.filter((form) => {
    const id = key(formName(form));
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function collectVehicles(source) {
  const vehicles = [];
  for (const keyName of ["vehicle", "vehicles", "pilotVehicle", "pilotVehicles"]) {
    const value = source?.[keyName];
    if (Array.isArray(value)) vehicles.push(...value);
    else if (value && typeof value === "object") vehicles.push(value);
  }
  vehicles.push(...collectNested(source, (value) => looksLikeVehicle(value)));
  return vehicles;
}

function collectNested(source, predicate) {
  const found = [];
  const seen = new WeakSet();

  function visit(value, path = [], depth = 0) {
    if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) return;
    seen.add(value);
    if (predicate(value, path)) found.push(value);

    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, [...path, String(index)], depth + 1));
      return;
    }

    for (const [keyName, child] of Object.entries(value)) {
      if (!["skills", "weapons", "customWeapons", "armor", "shields", "accessories", "attributes", "statuses", "modifiers"].includes(keyName)) {
        visit(child, [...path, keyName], depth + 1);
      }
    }
  }

  visit(source);
  return found;
}

function directModules(container) {
  const modules = [];
  for (const keyName of ["modules", "module", "enabledModules", "selectedModules", "armorModules", "weaponModules", "supportModules", "vehicleModules", "pilotModules"]) {
    const value = container?.[keyName];
    if (Array.isArray(value)) modules.push(...value);
    else if (value && typeof value === "object") modules.push(...Object.values(value));
  }
  return modules.filter((value) => value && typeof value === "object");
}

function findVehicleForModule(source, module) {
  for (const vehicle of collectVehicles(source)) {
    if (directModules(vehicle).includes(module)) return vehicle;
  }
  return null;
}

function looksLikeModule(value, path = []) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (looksLikeVehicle(value)) return false;
  const pathText = path.join(".").toLowerCase();
  const text = lowerText(value);
  const hasModuleField = Boolean(value.moduleName || value.moduleType || value.equippedSlot || value.accuracyCheck || value.selectedAccuracyCheck || value.attackCheck || value.damage !== undefined || value.damageModifier !== undefined);
  const underPilotSpells = pathText.includes("spells");
  return hasModuleField
    || pathText.includes("module")
    || /\b(module|weapon|armor|support)\b/.test(text)
    || (underPilotSpells && /accuracy\s*:|damage\s*:|defense\s*:|m\.?\s*defense\s*:/.test(text));
}

function looksLikeVehicle(value) {
  if (!value || typeof value !== "object" || !directModules(value).length) return false;
  const text = lowerText(value);
  return /\b(vehicle|project|exoskeleton|mecha|personal vehicle)\b/.test(text);
}

function looksLikeTherioform(value, path = []) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const name = formName(value);
  if (!name || key(name).includes("therioformdetails")) return false;
  const pathText = path.join(".").toLowerCase();
  const text = lowerText(value);
  const explicit = pathText.includes("therio") || /therioform|genoclepsis/.test(text);
  const mutantSpellShape = pathText.includes("spells")
    && !looksLikeStandardSpell(value)
    && Boolean(description(value) || value.genoclepsis || value.genoclepsisSuggestions || value.suggestions || value.info);
  return explicit || mutantSpellShape;
}

function looksLikeStandardSpell(value) {
  return value.mp !== undefined
    || value.attr1 !== undefined
    || value.attr2 !== undefined
    || value.targetDesc !== undefined
    || value.isOffensive !== undefined;
}

function moduleAction(module, vehicle) {
  const parsed = parseModuleText(module);
  const acc = module.accuracyCheck || module.selectedAccuracyCheck || module.check || module.attackCheck || {};
  const diceOne = attr(acc.att1 || acc.attributeOne || module.attr1 || module.attributeOne || parsed.diceOne);
  const diceTwo = attr(acc.att2 || acc.attributeTwo || module.attr2 || module.attributeTwo || parsed.diceTwo);
  const damage = moduleDamage(module, parsed);
  const hasCheck = Boolean(parsed.diceOne || parsed.diceTwo || acc.att1 || acc.att2 || acc.attributeOne || acc.attributeTwo || module.attr1 || module.attr2);
  const hasDamage = damage !== null;
  if (!isWeaponModule(module) || (!hasCheck && !hasDamage)) return null;

  const bonus = number(module.precModifier ?? module.accuracyModifier ?? module.bonus ?? parsed.bonus, 0);
  const prefix = vehicle ? `${vehicleName(vehicle)}: ` : "";
  return {
    name: `${prefix}${moduleName(module)}`,
    info: `${diceOne.toUpperCase()} + ${diceTwo.toUpperCase()}${bonus ? ` + ${bonus}` : ""} | HR + ${damage ?? 10} ${damageType(module)}`,
    detail: moduleDetail(module, vehicle),
    diceOne,
    diceTwo,
    bonus,
    damage: damage ?? 10,
    useHR: true
  };
}

function moduleInfo(module, vehicle) {
  return [
    moduleEnabled(module) ? "Equipped" : "Available",
    moduleType(module),
    vehicle ? `Vehicle: ${vehicleName(vehicle)}` : "",
    statLine(module, "defModifier", "DEF"),
    statLine(module, "mDefModifier", "M.DEF"),
    statLine(module, "initModifier", "INIT")
  ].filter(Boolean).join(" | ");
}

function moduleDetail(module, vehicle) {
  const parsed = parseModuleText(module);
  const acc = module.accuracyCheck || module.selectedAccuracyCheck || module.check || module.attackCheck || {};
  const first = attr(acc.att1 || acc.attributeOne || module.attr1 || module.attributeOne || parsed.diceOne);
  const second = attr(acc.att2 || acc.attributeTwo || module.attr2 || module.attributeTwo || parsed.diceTwo);
  const details = [
    vehicle ? `Vehicle: ${vehicleName(vehicle)}` : "",
    moduleType(module) ? `Type: ${moduleType(module)}` : "",
    parsed.diceOne || parsed.diceTwo || acc.att1 || acc.att2 ? `Accuracy: ${first.toUpperCase()} + ${second.toUpperCase()}${parsed.bonus ? ` ${signed(parsed.bonus)}` : ""}` : "",
    moduleDamage(module, parsed) !== null ? `Damage: HR + ${moduleDamage(module, parsed)} ${damageType(module)}` : "",
    description(module)
  ];
  return details.filter(Boolean).join("\n");
}

function moduleName(module) {
  return clean(module.customName || module.displayName || module.title || module.moduleName || module.name || "Module");
}

function moduleType(module) {
  return human(module.type || module.category || module.section || module.kind || module.moduleType || "");
}

function moduleEnabled(module) {
  const status = String(module.status || module.state || "").toLowerCase();
  return Boolean(module.equipped || module.isEquipped || module.enabled || module.active || module.selected)
    || status.includes("equipped")
    || status.includes("active");
}

function isWeaponModule(module) {
  const text = lowerText(module);
  return /weapon|accuracy\s*:|damage\s*:|hr\s*\+/.test(text)
    || Boolean(module.accuracyCheck || module.selectedAccuracyCheck || module.attackCheck || module.damage !== undefined || module.damageModifier !== undefined);
}

function moduleDamage(module, parsed = parseModuleText(module)) {
  if (module.damage !== undefined) return number(module.damage, 10);
  if (module.baseDamage !== undefined) return number(module.baseDamage, 10) + number(module.damageModifier, 0);
  if (parsed.damage !== null) return parsed.damage;
  if (module.damageModifier !== undefined || module.selectedDamageModifier !== undefined) {
    return 10 + number(module.damageModifier ?? module.selectedDamageModifier, 0);
  }
  return null;
}

function parseModuleText(module) {
  const text = textOf(module);
  const check = text.match(/\[?\s*(dex|ins|mig|wil|dexterity|insight|might|willpower|will)\s*\+\s*(dex|ins|mig|wil|dexterity|insight|might|willpower|will)\s*\]?\s*([+-]\s*\d+)?/i);
  const damage = text.match(/damage\s*:\s*\[?\s*hr\s*\+\s*(\d+)/i) || text.match(/hr\s*\+\s*(\d+)/i);
  return {
    diceOne: check?.[1] || "",
    diceTwo: check?.[2] || "",
    bonus: check?.[3] ? Number(check[3].replace(/\s+/g, "")) : 0,
    damage: damage ? Number(damage[1]) : null
  };
}

function formName(form) {
  return clean(form.customName || form.displayName || form.title || form.therioform || form.name || "");
}

function formInfo(form) {
  const suggestions = clean(form.genoclepsisSuggestions || form.genoclepsis || form.suggestions || form.info || "");
  return suggestions ? `Genoclepsis: ${suggestions}` : "Therioform";
}

function formDetail(form) {
  return [
    form.genoclepsisSuggestions || form.genoclepsis || form.suggestions ? `Genoclepsis Suggestions: ${clean(form.genoclepsisSuggestions || form.genoclepsis || form.suggestions)}` : "",
    description(form)
  ].filter(Boolean).join("\n");
}

function findOrCreateCategory(categories, name, info) {
  const id = key(name);
  let category = categories.find((entry) => key(entry.categoryName) === id);
  if (!category) {
    category = { categoryName: name, categoryInfo: info, items: [], collapse: true };
    categories.push(category);
  }
  category.categoryName = name;
  category.categoryInfo = info;
  return category;
}

function upsert(list, item) {
  const id = key(item.name);
  const existing = list.find((entry) => key(entry.name) === id);
  if (existing) Object.assign(existing, item);
  else list.push(item);
}

function removeSpellItems(categories, names) {
  for (const category of categories || []) {
    if (!String(category.categoryName || "").toLowerCase().includes("spells")) continue;
    category.items = (category.items || []).filter((item) => !names.has(key(item.name)));
  }
}

function removeActions(actions, names) {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    if (names.has(key(actions[index]?.name))) actions.splice(index, 1);
  }
}

function removeEmptySpellCategories(categories) {
  for (let index = (categories || []).length - 1; index >= 0; index -= 1) {
    const category = categories[index];
    if (String(category?.categoryName || "").toLowerCase().includes("spells") && !(category.items || []).length) {
      categories.splice(index, 1);
    }
  }
}

function className(cls) {
  return clean(cls.name || cls.className || cls.characterClassName || "Class");
}

function vehicleName(vehicle) {
  return clean(vehicle.customName || vehicle.displayName || vehicle.title || vehicle.name || "Vehicle");
}

function description(value) {
  for (const keyName of ["description", "effect", "detail", "rules", "summary", "text"]) {
    const next = value?.[keyName];
    const text = Array.isArray(next) ? next.map(clean).filter(Boolean).join("\n") : clean(next || "");
    if (text && !isTranslationKey(text)) return text;
  }
  return "";
}

function textOf(value) {
  return [
    value.name,
    value.customName,
    value.displayName,
    value.title,
    value.type,
    value.category,
    value.section,
    value.kind,
    value.moduleType,
    value.info,
    value.description,
    value.effect,
    value.detail,
    value.rules,
    value.summary,
    value.genoclepsis,
    value.genoclepsisSuggestions,
    value.suggestions
  ].map(clean).filter(Boolean).join("\n");
}

function lowerText(value) {
  return textOf(value).toLowerCase();
}

function statLine(value, field, label) {
  return value[field] !== undefined ? `${label} ${signed(number(value[field], 0))}` : "";
}

function damageType(module) {
  return human(module.damageType || module.selectedType || module.customDamageType || module.element || "physical").toLowerCase();
}

function attr(value) {
  return ATTRS[String(value || "").toLowerCase()] || "dex";
}

function signed(value) {
  const parsed = number(value, 0);
  return parsed >= 0 ? `+${parsed}` : String(parsed);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function human(value) {
  return clean(value)
    .replace(/^pilot_(module|frame)_/, "")
    .replace(/^weapon_(category|range|customization)_/, "")
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function key(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function clean(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function isTranslationKey(value) {
  return /^[A-Za-z][A-Za-z0-9]*_desc$/.test(value)
    || /^weapon_[a-z0-9_]+_(effect|desc)$/.test(value)
    || /^[a-z]+_[a-z0-9_]+_(effect|desc)$/.test(value);
}
