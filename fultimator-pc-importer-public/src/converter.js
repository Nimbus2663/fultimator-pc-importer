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
  weapon_customization_accurate: "Accurate",
  weapon_customization_defenseboost: "Defense Boost",
  weapon_customization_magicdefenseboost: "Magic Defense Boost",
  weapon_customization_transforming: "Transforming",
  weapon_customization_elemental: "Elemental",
  weapon_customization_powerful: "Powerful",
  weapon_customization_quick: "Quick",
  pilot_module_armor: "Armor Module",
  pilot_module_weapon: "Weapon Module",
  pilot_module_support: "Support Module",
  pilot_frame_exoskeleton: "Exoskeleton Frame"
};

export function parseFultimatorInput(rawText) {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && Array.isArray(parsed.characters)) {
    return parsed.characters;
  }

  if (parsed && Array.isArray(parsed.pcs)) {
    return parsed.pcs;
  }

  return [parsed];
}

export function convertFultimatorPC(source, options = {}) {
  if (!source || typeof source !== "object") {
    throw new Error("JSON invalido.");
  }

  if (source.dataType && source.dataType !== "pc") {
    throw new Error(`${source.name || "Este archivo"} no parece ser un PJ de Fultimator.`);
  }

  const includeDetails = options.includeDetails !== false;
  const attrs = {
    dex: die(source.attributes?.dexterity),
    ins: die(source.attributes?.insight),
    mig: die(source.attributes?.might),
    wil: die(source.attributes?.willpower)
  };

  const derived = deriveStats(source);
  const id = makeId();
  const converted = {
    id,
    name: "",
    level: number(source.lvl ?? source.level, 1),
    traits: {
      name: cleanText(source.name || source.info?.name || "Unnamed"),
      identity: cleanText(source.info?.identity || ""),
      theme: cleanText(source.info?.theme || ""),
      origin: cleanText(source.info?.origin || ""),
      avatar: source.info?.imgurl || "",
      level: number(source.lvl ?? source.level, 1)
    },
    bonds: buildBonds(source.info?.bonds),
    attributes: {
      dex: attrs.dex,
      ins: attrs.ins,
      mig: attrs.mig,
      wil: attrs.wil,
      currentdex: attrs.dex,
      currentins: attrs.ins,
      currentmig: attrs.mig,
      currentwil: attrs.wil
    },
    debuff: {
      slow: Boolean(source.statuses?.slow),
      dazed: Boolean(source.statuses?.dazed),
      weak: Boolean(source.statuses?.weak),
      shaken: Boolean(source.statuses?.shaken),
      enraged: Boolean(source.statuses?.enraged),
      poisoned: Boolean(source.statuses?.poisoned)
    },
    buff: {
      dex: Boolean(source.statuses?.dexUp),
      ins: Boolean(source.statuses?.insUp),
      mig: Boolean(source.statuses?.migUp),
      wil: Boolean(source.statuses?.wlpUp)
    },
    stats: {
      martialDef: hasMartialTraining(source),
      defenseMod: derived.defenseMod,
      defense: derived.defense,
      defenseMartial: derived.defense,
      mDefenseMod: derived.mDefenseMod,
      mDefense: derived.mDefense,
      initMod: derived.initMod,
      hpMod: number(source.modifiers?.hp, 0),
      mpMod: number(source.modifiers?.mp, 0),
      ipMod: number(source.modifiers?.ip, 0),
      fabula: number(source.info?.fabulapoints, 0),
      experience: number(source.info?.exp, 0),
      currentHP: number(source.stats?.hp?.current, 0),
      currentMP: number(source.stats?.mp?.current, 0),
      currentIP: number(source.stats?.ip?.current, 0),
      maxHP: number(source.stats?.hp?.max, 0),
      maxMP: number(source.stats?.mp?.max, 0),
      maxIP: number(source.stats?.ip?.max, 0)
    },
    items: buildItems(source, derived),
    skills: includeDetails ? buildSkillCategories(source) : [],
    actions: buildActions(source, derived),
    linkedStats: {
      currentHP: "",
      currentMP: "",
      currentIP: "",
      defense: "",
      mDefense: "",
      fabula: ""
    },
    lastEdit: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now())
  };

  return converted;
}

export function applyOverrides(character, overrides = {}) {
  const next = globalThis.structuredClone
    ? globalThis.structuredClone(character)
    : JSON.parse(JSON.stringify(character));
  for (const key of ["currentHP", "maxHP", "currentMP", "maxMP", "currentIP", "maxIP", "defense", "mDefense"]) {
    if (overrides[key] !== undefined && overrides[key] !== "") {
      next.stats[key] = number(overrides[key], next.stats[key]);
    }
  }
  return next;
}

function deriveStats(source) {
  const dex = number(source.attributes?.dexterity, 6);
  const ins = number(source.attributes?.insight, 6);
  const armor = firstEquipped(source.armor);
  const shield = firstEquipped(source.shields);
  const weapon = firstEquipped(source.customWeapons) || firstEquipped(source.weapons);
  const weaponForm = activeWeaponForm(weapon);

  let defenseMod = number(source.modifiers?.def, 0);
  let mDefenseMod = number(source.modifiers?.mdef, 0);
  let initMod = number(source.modifiers?.init, 0);

  if (armor) {
    defenseMod += number(armor.def, 0) + number(armor.defModifier, 0);
    mDefenseMod += number(armor.mdef, 0) + number(armor.mDefModifier, 0);
    initMod += number(armor.init, 0) + number(armor.initModifier, 0);
  }

  if (shield) {
    defenseMod += number(shield.def, 0) + number(shield.defModifier, 0);
    mDefenseMod += number(shield.mdef, 0) + number(shield.mDefModifier, 0);
    initMod += number(shield.init, 0) + number(shield.initModifier, 0);
  }

  if (weapon) {
    defenseMod += number(weaponForm.defModifier, 0);
    mDefenseMod += number(weaponForm.mDefModifier, 0);
    initMod += number(weaponForm.initModifier, 0);
    for (const customization of weaponForm.customizations || []) {
      if (customization?.name === "weapon_customization_defenseboost") {
        defenseMod += 1;
      }
      if (customization?.name === "weapon_customization_magicdefenseboost") {
        mDefenseMod += 1;
      }
    }
  }

  return {
    defenseMod,
    mDefenseMod,
    initMod,
    defense: dex + defenseMod,
    mDefense: ins + mDefenseMod
  };
}

function buildItems(source, derived) {
  const armor = firstEquipped(source.armor);
  const shield = firstEquipped(source.shields);
  const weapon = firstEquipped(source.customWeapons) || firstEquipped(source.weapons);
  const offhand = shield || (weapon?.secondWeaponName ? { name: weapon.secondWeaponName } : null);
  const equipment = [];

  if (armor?.name) equipment.push(armorDetail(armor));
  if (weapon?.name) equipment.push(weaponItemSummary(source, weapon));
  if (shield?.name) equipment.push(shieldDetail(shield));
  for (const accessory of equippedList(source.accessories)) {
    equipment.push(`Accessory: ${cleanText(accessory.name || "Accessory")}${accessory.quality ? ` - ${cleanDescription(accessory.quality)}` : ""}`);
  }
  const vehicleLines = pilotVehicleLines(source);
  if (vehicleLines.length) equipment.push("", ...vehicleLines);
  const standaloneModuleLines = pilotStandaloneModuleLines(source);
  if (standaloneModuleLines.length) equipment.push("", ...standaloneModuleLines);
  if (source.info?.description) equipment.push("", cleanText(source.info.description));

  return {
    accessory: equippedName(source.accessories),
    armor: armor?.name || "",
    mainhand: weapon?.name || "",
    offhand: offhand?.name || "",
    notes: equipment.filter(Boolean).join("\n"),
    zenit: number(source.info?.zenit, 0),
    martialRitual: derived.martialRitual || ""
  };
}

function buildSkillCategories(source) {
  const categories = [];
  for (const cls of source.classes || []) {
    const skillItems = [];
    for (const skill of cls.skills || []) {
      const current = number(skill.currentLvl, 0);
      if (current <= 0) {
        continue;
      }
      const detail = skillDetail(skill);
      skillItems.push({
        name: cleanText(skill.skillName || "Skill"),
        info: `${current}/${number(skill.maxLvl, 0)}`,
        detail
      });
    }

    categories.push({
      categoryName: `${cleanText(cls.name || "Class")} Lv ${number(cls.lvl, 0)}`,
      categoryInfo: "Class",
      items: skillItems.length ? skillItems : [{ name: cleanText(cls.name || "Class"), info: `Level ${number(cls.lvl, 0)}`, detail: "" }],
      collapse: true
    });

    const spells = (cls.spells || []).filter((spell) => spell.showInPlayerSheet !== false);
    if (spells.length) {
      categories.push({
        categoryName: `${cls.name || "Class"} Spells`,
        categoryInfo: "Spells",
        items: spells.map((spell) => ({
          name: cleanText(spell.name || "Spell"),
          info: `${formatSpellCheck(spell)} | ${number(spell.mp, 0)} MP${spell.targetDesc ? ` | ${cleanText(spell.targetDesc)}` : ""}`,
          detail: [spell.duration ? `Duration: ${cleanText(spell.duration)}` : "", cleanDescription(spell.description)].filter(Boolean).join("\n")
        })),
        collapse: true
      });
    }
  }

  const vehicleItems = pilotVehicleItems(source);
  if (vehicleItems.length) {
    categories.push({
      categoryName: "Pilot Vehicles",
      categoryInfo: "Vehicles and modules",
      items: vehicleItems,
      collapse: true
    });
  }

  const moduleItems = pilotModuleItems(source);
  if (moduleItems.length) {
    categories.push({
      categoryName: "Pilot Modules",
      categoryInfo: "Weapon / Armor / Support",
      items: moduleItems,
      collapse: true
    });
  }

  const notes = [];
  if (source.info?.description) notes.push(cleanText(source.info.description));
  if (source.notes?.length) {
    notes.push(...source.notes.map((note) => typeof note === "string" ? note : JSON.stringify(note)));
  }
  if (notes.length) {
    categories.push({
      categoryName: "Notes",
      categoryInfo: "Imported from Fultimator",
      items: [{ name: "Character Notes", info: "", detail: notes.join("\n\n") }],
      collapse: true
    });
  }

  return categories;
}

function buildActions(source, derived) {
  const actions = [{
    name: "Initiative",
    info: "DEX + INS",
    detail: "Imported from Fultimator",
    diceOne: "dex",
    diceTwo: "ins",
    bonus: derived.initMod,
    damage: 0,
    useHR: false
  }];

  for (const weapon of equippedWeapons(source)) {
    const acc = weapon.accuracyCheck || {};
    const diceOne = attrKey(acc.att1);
    const diceTwo = attrKey(acc.att2);
    const bonus = weaponPrecisionBonus(source, weapon);
    const damage = weaponDamage(weapon);
    actions.push({
      name: cleanText(weapon.name || "Weapon Attack"),
      info: `${formatDicePair(diceOne, diceTwo)}${bonus ? ` + ${bonus}` : ""} | HR + ${damage} ${damageType(weapon)}`,
      detail: weaponDetail(source, weapon, false),
      diceOne,
      diceTwo,
      bonus,
      damage,
      useHR: true
    });

    if (weapon.secondWeaponName) {
      const secondAcc = weapon.secondSelectedAccuracyCheck || {};
      const secondDiceOne = attrKey(secondAcc.att1);
      const secondDiceTwo = attrKey(secondAcc.att2);
      const secondBonus = weaponPrecisionBonus(source, weapon, true);
      const secondDamage = weaponDamage(weapon, true);
      actions.push({
        name: cleanText(weapon.secondWeaponName),
        info: `${formatDicePair(secondDiceOne, secondDiceTwo)}${secondBonus ? ` + ${secondBonus}` : ""} | HR + ${secondDamage} ${damageType(weapon, true)}`,
        detail: weaponDetail(source, weapon, true),
        diceOne: secondDiceOne,
        diceTwo: secondDiceTwo,
        bonus: secondBonus,
        damage: secondDamage,
        useHR: true
      });
    }
  }

  actions.push(...pilotModuleActions(source));

  for (const cls of source.classes || []) {
    for (const spell of cls.spells || []) {
      if (spell.showInPlayerSheet === false) continue;
      const diceOne = attrKey(spell.attr1);
      const diceTwo = attrKey(spell.attr2);
      const bonus = number(source.modifiers?.magicPrec, 0);
      const damage = parseHRDamage(spell.description);
      actions.push({
        name: cleanText(spell.name || "Spell"),
        info: `${formatDicePair(diceOne, diceTwo)}${bonus ? ` + ${bonus}` : ""} | ${number(spell.mp, 0)} MP${damage ? ` | HR + ${damage}` : ""}`,
        detail: [spell.targetDesc ? `Target: ${cleanText(spell.targetDesc)}` : "", spell.duration ? `Duration: ${cleanText(spell.duration)}` : "", cleanDescription(spell.description)].filter(Boolean).join("\n"),
        diceOne,
        diceTwo,
        bonus,
        damage,
        useHR: Boolean(spell.isOffensive)
      });
    }
  }

  actions.push({
    name: "",
    info: "",
    detail: "",
    diceOne: "dex",
    diceTwo: "dex",
    bonus: 0,
    damage: 0,
    useHR: true
  });

  return actions;
}

function buildBonds(bonds) {
  const list = Array.isArray(bonds) ? bonds : [];
  const mapped = list.slice(0, 6).map((bond) => ({
    name: bond?.name || "",
    emotionOne: bond?.emotionOne || bond?.emotion1 || "",
    emotionTwo: bond?.emotionTwo || bond?.emotion2 || "",
    emotionThree: bond?.emotionThree || bond?.emotion3 || ""
  }));
  while (mapped.length < 6) {
    mapped.push({ name: "", emotionOne: "", emotionTwo: "", emotionThree: "" });
  }
  return mapped;
}

function equippedWeapons(source) {
  const custom = Array.isArray(source.customWeapons) ? source.customWeapons : [];
  const regular = Array.isArray(source.weapons) ? source.weapons : [];
  return [...custom, ...regular].filter((weapon) => weapon?.isEquipped || custom.length + regular.length === 1);
}

function skillDetail(skill) {
  const rawDescription = cleanText(skill.description || "");
  const description = firstRealDescription(skill, ["description", "detail", "effect", "text", "rules", "summary"]);
  const lines = [
    description,
    !description && isFultimatorTranslationKey(rawDescription)
      ? `Compendium: search "${cleanText(skill.skillName || humanizeKey(rawDescription))}". Fultimator exported only the internal key ${rawDescription}.`
      : "",
    skill.specialSkill && skill.specialSkill !== skill.skillName ? `Special: ${cleanText(skill.specialSkill)}` : ""
  ];
  return lines.filter(Boolean).join("\n");
}

function weaponDetail(source, weapon, second = false) {
  const acc = second ? weapon.secondSelectedAccuracyCheck || {} : weapon.accuracyCheck || {};
  const customizations = second ? weapon.secondCurrentCustomizations || [] : weapon.customizations || [];
  const detail = [
    `Check: ${formatDicePair(attrKey(acc.att1), attrKey(acc.att2))}`,
    `Damage: HR + ${weaponDamage(weapon, second)} ${damageType(weapon, second)}`,
    weaponCategory(weapon, second) ? `Category: ${weaponCategory(weapon, second)}` : "",
    weaponRange(weapon, second) ? `Range: ${weaponRange(weapon, second)}` : "",
    weapon.hands ? `Hands: ${weapon.hands}` : "",
    customizations.length ? `Customizations: ${customizations.map((item) => humanizeKey(item.name)).join(", ")}` : "",
    cleanDescription(second ? weapon.secondQuality : weapon.quality)
  ];
  return detail.filter(Boolean).join("\n");
}

function weaponPrecisionBonus(source, weapon, second = false) {
  const range = weaponRange(weapon, second).toLowerCase();
  const customizations = second ? weapon.secondCurrentCustomizations || [] : weapon.customizations || [];
  let bonus = number(second ? weapon.secondPrecModifier : weapon.precModifier, 0);

  if (range.includes("ranged")) {
    bonus += number(source.modifiers?.rangedPrec, 0);
  } else if (range.includes("melee")) {
    bonus += number(source.modifiers?.meleePrec, 0);
  }

  for (const customization of customizations) {
    if (customization?.name === "weapon_customization_accurate") {
      bonus += 1;
    }
  }

  return bonus;
}

function weaponDamage(weapon, second = false) {
  return 10 + number(second ? weapon.secondDamageModifier : weapon.damageModifier, 0);
}

function damageType(weapon, second = false) {
  const value = second
    ? weapon.secondCustomDamageType || weapon.secondSelectedType || weapon.customDamageType || weapon.type
    : weapon.customDamageType || weapon.type;
  return humanizeKey(value || "physical").toLowerCase();
}

function weaponRange(weapon, second = false) {
  return humanizeKey(second ? weapon.secondSelectedRange || weapon.range : weapon.range);
}

function weaponCategory(weapon, second = false) {
  return humanizeKey(second ? weapon.secondSelectedCategory || weapon.category : weapon.category);
}

function weaponDefenseBonus(weapon, second = false) {
  const customizations = second ? weapon.secondCurrentCustomizations || [] : weapon.customizations || [];
  let value = number(second ? weapon.secondDefModifier : weapon.defModifier, 0);
  for (const customization of customizations) {
    if (customization?.name === "weapon_customization_defenseboost") value += 1;
  }
  return value;
}

function weaponMagicDefenseBonus(weapon, second = false) {
  const customizations = second ? weapon.secondCurrentCustomizations || [] : weapon.customizations || [];
  let value = number(second ? weapon.secondMDefModifier : weapon.mDefModifier, 0);
  for (const customization of customizations) {
    if (customization?.name === "weapon_customization_magicdefenseboost") value += 1;
  }
  return value;
}

function firstEquipped(list) {
  if (!Array.isArray(list)) return null;
  return list.find((item) => item?.isEquipped) || null;
}

function equippedList(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => item?.isEquipped);
}

function equippedName(list) {
  const item = firstEquipped(list);
  return item?.name || "";
}

function hasMartialTraining(source) {
  for (const cls of source.classes || []) {
    const martials = cls.benefits?.martials || {};
    if (martials.armor || martials.shields || martials.melee || martials.ranged) {
      return true;
    }
  }

  return equippedWeapons(source).some((weapon) => Boolean(weapon.martial));
}

function activeWeaponForm(weapon) {
  if (!weapon) return {};
  const hasTransforming = (weapon.customizations || []).some((item) => item?.name === "weapon_customization_transforming");
  if (!hasTransforming || weapon.activeForm !== "secondary") {
    return {
      defModifier: weapon.defModifier,
      mDefModifier: weapon.mDefModifier,
      initModifier: weapon.initModifier,
      customizations: weapon.customizations || []
    };
  }

  return {
    defModifier: weapon.secondDefModifier,
    mDefModifier: weapon.secondMDefModifier,
    initModifier: weapon.secondInitModifier,
    customizations: weapon.secondCurrentCustomizations || []
  };
}

function armorDetail(armor) {
  return [
    `Armor: ${cleanText(armor.name || "Armor")}`,
    `DEF ${signed(number(armor.def, 0))}`,
    `M.DEF ${signed(number(armor.mdef, 0))}`,
    `Init ${signed(number(armor.init, 0))}`,
    armor.martial ? "Martial" : "",
    armor.defModifier ? `DEF mod ${signed(number(armor.defModifier, 0))}` : "",
    armor.mDefModifier ? `M.DEF mod ${signed(number(armor.mDefModifier, 0))}` : "",
    cleanDescription(armor.quality)
  ].filter(Boolean).join(" | ");
}

function shieldDetail(shield) {
  return [
    `Shield: ${cleanText(shield.name || "Shield")}`,
    shield.def || shield.defModifier ? `DEF ${signed(number(shield.def, 0) + number(shield.defModifier, 0))}` : "",
    shield.mdef || shield.mDefModifier ? `M.DEF ${signed(number(shield.mdef, 0) + number(shield.mDefModifier, 0))}` : "",
    shield.init || shield.initModifier ? `Init ${signed(number(shield.init, 0) + number(shield.initModifier, 0))}` : "",
    shield.martial ? "Martial" : "",
    cleanDescription(shield.quality)
  ].filter(Boolean).join(" | ");
}

function weaponItemSummary(source, weapon) {
  const primaryDef = weaponDefenseBonus(weapon, false);
  const primaryMDef = weaponMagicDefenseBonus(weapon, false);
  const primary = [
    `Weapon: ${cleanText(weapon.name || "Weapon")}`,
    weaponCategory(weapon, false) ? `Category: ${weaponCategory(weapon, false)}` : "",
    weapon.activeForm ? `Active: ${weapon.activeForm}` : "",
    primaryDef ? `DEF ${signed(primaryDef)}` : "",
    primaryMDef ? `M.DEF ${signed(primaryMDef)}` : "",
    weapon.customizations?.length ? `Custom: ${weapon.customizations.map((item) => humanizeKey(item.name)).join(", ")}` : ""
  ].filter(Boolean).join(" | ");

  if (!weapon.secondWeaponName) return primary;

  const secondaryDef = weaponDefenseBonus(weapon, true);
  const secondaryMDef = weaponMagicDefenseBonus(weapon, true);
  const secondary = [
    `Alt: ${cleanText(weapon.secondWeaponName)}`,
    weaponCategory(weapon, true) ? `Category: ${weaponCategory(weapon, true)}` : "",
    secondaryDef ? `DEF ${signed(secondaryDef)}` : "",
    secondaryMDef ? `M.DEF ${signed(secondaryMDef)}` : "",
    weapon.secondCurrentCustomizations?.length ? `Custom: ${weapon.secondCurrentCustomizations.map((item) => humanizeKey(item.name)).join(", ")}` : ""
  ].filter(Boolean).join(" | ");

  return `${primary}\n${secondary}`;
}

function pilotVehicleItems(source) {
  return collectPilotVehicles(source).map((vehicle) => ({
    name: cleanText(vehicle.customName || vehicle.name || "Vehicle"),
    info: `${humanizeKey(vehicle.frame || "pilot_frame_exoskeleton")} | Enabled ${enabledModuleCount(vehicle)}/${number(vehicle.maxEnabledModules, 3)}`,
    detail: pilotVehicleLines({ vehicles: [vehicle] }).join("\n")
  }));
}

function pilotStandaloneModuleLines(source) {
  const modules = collectPilotModules(source).filter(({ vehicle }) => !vehicle);
  if (!modules.length) return [];
  return [
    "Pilot modules:",
    ...modules.map(({ module }) => `  ${moduleInfo(module, null)} | ${moduleDisplayName(module)}`)
  ];
}

function pilotModuleItems(source) {
  return collectPilotModules(source).map(({ module, vehicle }) => ({
    name: moduleDisplayName(module),
    info: moduleInfo(module, vehicle),
    detail: moduleDetail(module, vehicle)
  }));
}

function pilotVehicleLines(source) {
  const lines = [];
  for (const vehicle of collectPilotVehicles(source)) {
    const name = cleanText(vehicle.customName || vehicle.name || "Vehicle");
    lines.push(`Vehicle: ${name} | Frame: ${humanizeKey(vehicle.frame || "pilot_frame_exoskeleton")} | Enabled modules: ${enabledModuleCount(vehicle)}/${number(vehicle.maxEnabledModules, 3)}`);
    for (const module of collectVehicleModules(vehicle)) {
      lines.push(`  ${moduleInfo(module, vehicle)} | ${moduleDisplayName(module)}`);
      const detail = moduleEffect(module);
      if (detail) lines.push(`    ${detail}`);
    }
  }
  return lines;
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

function collectPilotModules(source) {
  const modules = [];
  for (const vehicle of collectPilotVehicles(source)) {
    for (const module of collectVehicleModules(vehicle)) {
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

  const seen = new Set();
  return modules.filter(({ module, vehicle }) => {
    if (!isPotentialModule(module)) return false;
    const key = JSON.stringify([
      module.name,
      module.customName,
      module.moduleName,
      module.type,
      module.equippedSlot,
      vehicle?.name,
      vehicle?.customName
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectVehicleModules(vehicle) {
  return collectModuleValues(vehicle).filter(isPotentialModule);
}

function collectModuleValues(container) {
  if (!container || typeof container !== "object") return [];
  const values = [];
  const moduleKeys = [
    "modules",
    "module",
    "pilotModules",
    "vehicleModules",
    "enabledModules",
    "selectedModules",
    "supportModules",
    "weaponModules",
    "armorModules"
  ];

  for (const key of moduleKeys) {
    const value = container[key];
    if (Array.isArray(value)) values.push(...value);
    else if (value && typeof value === "object") values.push(...Object.values(value));
  }

  return values.filter((value) => value && typeof value === "object");
}

function isPotentialModule(value) {
  return Boolean(value && typeof value === "object" && (
    value.name
    || value.customName
    || value.moduleName
    || value.type
    || value.category
    || value.equippedSlot
    || value.isComplex !== undefined
    || value.accuracyCheck
    || value.selectedAccuracyCheck
    || value.damage !== undefined
    || value.damageModifier !== undefined
    || value.description
    || value.effect
  ));
}

function enabledModuleCount(vehicle) {
  return collectVehicleModules(vehicle).reduce((total, module) => {
    if (!moduleEnabled(module)) return total;
    return total + (module.type === "pilot_module_support" && module.isComplex ? 2 : 1);
  }, 0);
}

function pilotModuleActions(source) {
  return collectPilotModules(source)
    .map(({ module, vehicle }) => moduleAction(module, vehicle))
    .filter(Boolean);
}

function moduleAction(module, vehicle) {
  const acc = module.accuracyCheck || module.selectedAccuracyCheck || module.check || module.attackCheck || {};
  const hasCheck = Boolean(acc.att1 || acc.att2 || module.attr1 || module.attr2 || module.attributeOne || module.attributeTwo);
  const hasDamage = module.damage !== undefined
    || module.damageModifier !== undefined
    || module.selectedDamageModifier !== undefined
    || module.baseDamage !== undefined;

  if (!moduleWeaponLike(module) || (!hasCheck && !hasDamage)) {
    return null;
  }

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

function moduleDamage(module) {
  if (module.damage !== undefined) return number(module.damage, 10);
  if (module.baseDamage !== undefined) return number(module.baseDamage, 10) + number(module.damageModifier, 0);
  return 10 + number(module.damageModifier ?? module.selectedDamageModifier, 0);
}

function moduleDamageType(module) {
  return humanizeKey(module.damageType || module.selectedType || module.customDamageType || module.element || "physical").toLowerCase();
}

function moduleInfo(module, vehicle) {
  const pieces = [
    `[${moduleEnabled(module) ? "ON" : "OFF"}]`,
    moduleType(module),
    vehicle ? `Vehicle: ${cleanText(vehicle.customName || vehicle.name || "Vehicle")}` : "",
    module.equippedSlot ? `Slot: ${module.equippedSlot}` : "",
    module.isComplex ? "Complex" : "",
    module.cost ? `${module.cost} z` : "",
    module.defModifier ? `DEF ${signed(number(module.defModifier, 0))}` : "",
    module.mDefModifier ? `M.DEF ${signed(number(module.mDefModifier, 0))}` : "",
    module.initModifier ? `Init ${signed(number(module.initModifier, 0))}` : ""
  ];
  return pieces.filter(Boolean).join(" | ");
}

function moduleDetail(module, vehicle) {
  const acc = module.accuracyCheck || module.selectedAccuracyCheck || module.check || module.attackCheck || {};
  const firstAttr = acc.att1 || acc.attributeOne || module.attr1 || module.attributeOne;
  const secondAttr = acc.att2 || acc.attributeTwo || module.attr2 || module.attributeTwo;
  const lines = [
    vehicle ? `Vehicle: ${cleanText(vehicle.customName || vehicle.name || "Vehicle")}` : "",
    moduleType(module) ? `Type: ${moduleType(module)}` : "",
    module.equippedSlot ? `Slot: ${module.equippedSlot}` : "",
    firstAttr || secondAttr ? `Check: ${formatDicePair(attrKey(firstAttr), attrKey(secondAttr))}` : "",
    moduleWeaponLike(module) ? `Damage: HR + ${moduleDamage(module)} ${moduleDamageType(module)}` : "",
    module.range || module.selectedRange ? `Range: ${humanizeKey(module.range || module.selectedRange)}` : "",
    module.isComplex ? "Complex module" : "",
    moduleEffect(module)
  ];
  return lines.filter(Boolean).join("\n");
}

function moduleType(module) {
  return humanizeKey(module.type || module.category || module.moduleType || "");
}

function moduleDisplayName(module) {
  return cleanText(module.customName || module.displayName || module.moduleName || humanizeKey(module.name || "Module"));
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

function parseHRDamage(description) {
  const match = String(description || "").match(/HR\s*\+\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
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

function cleanDescription(value) {
  const text = cleanText(value || "").trim();
  if (!text || isFultimatorTranslationKey(text)) {
    return "";
  }
  return text;
}

function cleanText(value) {
  return repairMojibake(String(value || ""))
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

function repairMojibake(value) {
  if (!/[\u00c2\u00c3\u00e2\u00e3]/.test(value) || typeof TextDecoder === "undefined") {
    return value;
  }

  try {
    const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return mojibakeScore(decoded) < mojibakeScore(value) ? decoded : value;
  } catch {
    return value;
  }
}

function mojibakeScore(value) {
  return (value.match(/[\u00c2\u00c3\u00e2\u00e3\ufffd]/g) || []).length;
}

function isFultimatorTranslationKey(value) {
  return /^[A-Za-z][A-Za-z0-9]*_desc$/.test(value)
    || /^weapon_[a-z0-9_]+_(effect|desc)$/.test(value)
    || /^[a-z]+_[a-z0-9_]+_(effect|desc)$/.test(value);
}

function formatSpellCheck(spell) {
  return formatDicePair(attrKey(spell.attr1), attrKey(spell.attr2));
}

function formatDicePair(first, second) {
  return `${first.toUpperCase()} + ${second.toUpperCase()}`;
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

function attrKey(value) {
  return ATTRIBUTES[String(value || "").toLowerCase()] || "dex";
}

function die(value) {
  const parsed = number(value, 6);
  return `d${parsed}`;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function makeId() {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`);
}
