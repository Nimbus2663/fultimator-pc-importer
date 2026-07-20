# Fabula Scene HUD

Owlbear Rodeo overlay for Fabula Ultima characters stored in Ultimate Story scene metadata.

## What it reads

- Character data from `ultimate.story.extension/metadata`.
- HP, MP, IP, FP, DEF, M.DEF, avatar URLs, buffs, and debuffs.

## How it works

1. Install the extension manifest.
2. Enable it in the room.
3. Open a scene with Ultimate Story characters.
4. Click the Fabula HUD action.
5. Press **Abrir HUD**.

The overlay opens as a persistent popover, so it does not darken the whole Owlbear screen. It updates when the scene metadata changes, so changes made through Ultimate Story or the Fultimator importer are reflected live.
