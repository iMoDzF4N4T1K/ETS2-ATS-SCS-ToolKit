# Commandes utiles (DEV)

## Installer / compiler

```bash
npm install
npm run compile
```

## Lancer en debug (Extension Development Host)

Dans VS Code : touche **F5**

## Générer un VSIX

```bash
npm run vsix
```

## Installer un VSIX

- UI : Extensions → `...` → **Install from VSIX...**
- CLI :

```powershell
code --install-extension .\scs-toolkit-*.vsix
# ou
code-insiders --install-extension .\scs-toolkit-*.vsix
```

## Remarque importante (extensionHostProcess.js)

Les messages rouges du type `extensionHostProcess.js` / warnings `DEP00xx` dans la console de débogage viennent **souvent de VS Code / Node** (pas de ton extension).  
Tant que `npm run compile` ne sort **aucune erreur TypeScript**, ton code est OK.

## Formatter (auto)

- Auto format à l’enregistrement (SCS Script) : `scsTools.format.onSave`
- Alignement des `:` : `scsTools.format.alignColons`
- Indentation : `scsTools.format.indent`

Commande manuelle (Palette) : **SCS Toolkit: Format Document**.
