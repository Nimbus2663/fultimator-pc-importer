# Fultimator PC Importer

Owlbear Rodeo extension that imports Fultimator player-character JSON into the scene metadata used by Ultimate Story.

## Local test

1. Start a static server in this folder:

```text
node dev-server.cjs 5173
```

2. Add this manifest URL in Owlbear:

```text
http://127.0.0.1:5173/manifest.json
```

3. Open a scene in Owlbear.
4. Open this extension.
5. Click **1. Elegir JSON** or paste a Fultimator PC JSON.
6. Check the preview and click **2. Importar a escena**.
7. Open Ultimate Story and press **Save** on the imported character if you want it stored in Room Saved Character.

## Notes

- This writes to the scene metadata key `ultimate.story.extension/metadata`.
- It cannot write to Ultimate Story local saves directly because browser localStorage is isolated per extension origin.
- It keeps a backup/export button for the converted Ultimate Story JSON.
- It includes a Fabula Tracker panel that edits HP, MP, IP, avatar URL, and status effects from the same scene metadata.
- Pilot vehicles/modules are imported into notes plus `Pilot Vehicles` and `Pilot Modules` categories when present in the Fultimator JSON.
- Weapon-like pilot modules are also added as Ultimate Story actions when the JSON includes check/damage data.
- Official compendium text is not bundled. If Fultimator exports only keys such as `ElementalMagic_desc`, the importer adds a clean Compendium search reference instead.

## Public hosting

To avoid localhost/private-network problems, upload this folder to a static HTTPS host and use:

```text
https://your-public-site.example/manifest.json
```

The manifest uses relative paths, so it also works when hosted under a subfolder.

For the current GitHub/raw.githack upload, use:

```text
https://raw.githack.com/Nimbus2663/fultimator-pc-importer/main/fultimator-pc-importer-public/manifest.json
```
