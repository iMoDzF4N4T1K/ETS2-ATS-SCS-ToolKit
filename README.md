# 🚛 SCS Toolkit – ETS2 & ATS (VS Code Extension)

**SCS Toolkit** est une extension **Visual Studio Code** dédiée au **modding Euro Truck Simulator 2 (ETS2)** et **American Truck Simulator (ATS)**.

Elle apporte une expérience d’édition **professionnelle**, stable et performante pour les fichiers SCS, y compris les **saves très volumineuses**.

---

## ✨ Fonctionnalités

### 🎨 Coloration syntaxique SCS
- Support complet du langage **SCS Script**
- Coloration automatique des clés, valeurs, chemins et structures
- Fonctionne sur :
  - `info.sii`
  - `manifest.sii`
  - `game.sii` (saves)

### 📂 Formats supportés
- `.sii`
- `.sui`
- `.mat`

Aucune configuration utilisateur requise.

### 🚀 Gros fichiers & saves
- Support des fichiers très volumineux
- Désactivation intelligente des optimisations VS Code bloquantes
- Lecture fluide même sur des saves ETS2 / ATS massives

### 🔗 Liens intelligents
- Détection automatique des chemins SCS
- Navigation rapide vers :
  - `/def`
  - `/vehicle`
  - `/material`

### 🎯 DLC ETS2 & ATS
- Liste complète des DLC intégrée
- Support de `dlc_dependencies[]`
- ETS2 & ATS entièrement pris en charge

### 🧠 Clés SCS
- Base complète de clés SCS
- Réduction des erreurs de syntaxe
- Cohérence des fichiers mods

### 🧹 Format automatique
- Commande : **SCS Tools: Format Document**
- Indentation propre
- Structure claire et lisible

---

## ⚙️ Installation

### Via VSIX
- Extensions → … → Installer à partir d’un VSIX

### Build manuel
```bash
npm install
npm run compile
npm run vsix
```

---

## 👤 Auteur
**iMoDzF4N4TiK**

Outil communautaire non officiel.

Euro Truck Simulator 2 & American Truck Simulator sont des marques de **SCS Software**.

## License

This project is **NOT open-source**.

This software is released under a **proprietary license**.
Unauthorized redistribution, modification, or resale is strictly prohibited.

See `LICENSE.md` for full terms.
