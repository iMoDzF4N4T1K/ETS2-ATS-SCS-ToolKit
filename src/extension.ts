/*
 * © 2026 iMoDzF4N4TiK
 * All rights reserved.
 * Proprietary software – Unauthorized copying, redistribution,
 * or modification is strictly prohibited.
 */


import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DLC_IDS } from './dlcList';

// reservedWords.js exports an array of { name, type, description, example }
// Keep it as plain JS so you can update it easily without TS build steps.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const reservedWords: Array<{ name: string; type?: string; description?: string; example?: string }> = require('../reservedWords');

const RESERVED_SET = new Set(reservedWords.map(w => w.name));

const MANIFEST_CATEGORIES = [
  'truck', 'trailer', 'interior', 'tuning_parts', 'ai_traffic', 'sound', 'paint_job', 'cargo_pack', 'map', 'ui',
  'weather_setup', 'physics', 'graphics', 'models', 'movers', 'walkers', 'prefabs', 'other'
];

const COMMON_COMPATIBLE_VERSIONS = [
  '1.57.*', '1.56.*', '1.55.*', '1.54.*'
];

function cfg<T>(key: string, def: T): T {
  return vscode.workspace.getConfiguration().get<T>(key, def);
}

function getModRoot(): string | undefined {
  const v = cfg<string>('scsTools.modRoot', '${workspaceFolder}');
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) return undefined;
  if (v === '${workspaceFolder}') return ws;
  // allow relative from workspace
  return path.isAbsolute(v) ? v : path.join(ws, v);
}

/**
 * Root folder used for resolving absolute SCS-style paths like `/material/...`.
 *
 * By default we rely on the user-provided setting `scsTools.gameDataPath`.
 * If it's not set, we try to infer a nearby extracted folder next to the ETS2 install.
 */
function getGameDataPath(): string | undefined {
  const explicit = cfg<string>('scsTools.gameDataPath', '');
  if (explicit && explicit.trim().length) return explicit.trim();

	const ets2 = (getEts2Path() ?? '').trim();
  if (!ets2) return undefined;

  // Common names people use for extracted base data.
  const candidates = [
    path.join(ets2, 'base'),
    path.join(ets2, 'gameData'),
    path.join(ets2, 'extracted'),
    path.join(ets2, 'extract'),
    path.join(ets2, 'data'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
    } catch {
      // ignore
    }
  }
  return undefined;
}

// ---------- ETS2 installation auto-detection ----------
let cachedEts2Path: string | undefined;

function getEts2Path(): string | undefined {
  const configured = cfg<string>('scsTools.ets2Path', '');
  if (configured && typeof configured === 'string') return configured;
  return cachedEts2Path;
}

function normalizeWinPath(p: string): string {
  return p.replace(/\\/g, '\\');
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function parseSteamLibrariesFromVdf(vdfText: string): string[] {
  const libs = new Set<string>();
  // Newer format: "path" "D:\\SteamLibrary"
  for (const m of vdfText.matchAll(/"path"\s*"([^"]+)"/g)) {
    libs.add(normalizeWinPath(m[1]));
  }
  // Older format: "1" "D:\\SteamLibrary"
  for (const m of vdfText.matchAll(/"\d+"\s*"([^"]+)"/g)) {
    const candidate = normalizeWinPath(m[1]);
    // ignore entries that look like metadata, keep paths
    if (candidate.includes('\\') || candidate.includes(':')) libs.add(candidate);
  }
  return Array.from(libs);
}

async function detectEts2InstallPath(): Promise<string | undefined> {
  // Prefer parsing Steam libraryfolders.vdf when available.
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const home = os.homedir();

  const possibleSteamRoots = [
    path.join(pf86, 'Steam'),
    path.join(pf, 'Steam'),
    path.join(home, 'AppData', 'Local', 'Steam'),
  ];

  const gameRel = path.join('steamapps', 'common', 'Euro Truck Simulator 2');

  for (const steamRoot of possibleSteamRoots) {
    const vdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
    if (!fileExists(vdf)) continue;
    try {
      const txt = fs.readFileSync(vdf, 'utf8');
      const libs = parseSteamLibrariesFromVdf(txt);
      // Steam root itself is a library too
      libs.push(steamRoot);
      for (const lib of libs) {
        const candidate = path.join(lib, gameRel);
        if (fileExists(candidate)) return candidate;
      }
    } catch {
      // ignore and keep searching
    }
  }

  // Fast drive scan (NO recursion): X:\\SteamLibrary\\steamapps\\common\\Euro Truck Simulator 2
  const driveLetters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const patterns = [
    (d: string) => `${d}:\\\\SteamLibrary\\\\steamapps\\\\common\\\\Euro Truck Simulator 2`,
    (d: string) => `${d}:\\\\Steam\\\\steamapps\\\\common\\\\Euro Truck Simulator 2`,
  ];
  for (const d of driveLetters) {
    for (const pat of patterns) {
      const candidate = pat(d);
      if (fileExists(candidate)) return candidate;
    }
  }

  return undefined;
}

function isCommentOrEmpty(line: string): boolean {
  const t = line.trim();
  return t.length === 0 || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('*/');
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function activate(context: vscode.ExtensionContext) {
  // -------- Hovers (docs) --------
  const hoverProvider = vscode.languages.registerHoverProvider('scs', {
    provideHover(document, position) {
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][\w]*/);
      if (!wordRange) return;
      const word = document.getText(wordRange);
      const item = reservedWords.find(x => x.name === word);
      if (!item) return;

      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${item.name}**`);
      if (item.description) md.appendMarkdown(`\n\n${item.description}`);
      if (item.type) md.appendMarkdown(`\n\nType: **${item.type}**`);
      if (item.example) {
        md.appendMarkdown(`\n\n---\n`);
        md.appendMarkdown(`\`Example\`\n`);
        md.appendCodeblock(item.example, 'scs');
      }
      md.appendMarkdown(`\n\n---\n`);
      md.appendMarkdown(`[Search SCS modding wiki](https://modding.scssoft.com/index.php?search=${encodeURIComponent(item.name)}&title=Special%3ASearch&go=Go)`);
      md.isTrusted = true;
      return new vscode.Hover(md, wordRange);
    }
  });

	// -------- Commands --------
	const detectCmd = vscode.commands.registerCommand('scsTools.detectEts2Path', async () => {
	  const found = await detectEts2InstallPath();
	  if (!found) {
	    vscode.window.showWarningMessage('SCS Toolkit: ETS2 install not found automatically. You can set it manually in Settings: scsTools.ets2Path');
	    return;
	  }
	  cachedEts2Path = found;
	  await vscode.workspace.getConfiguration().update('scsTools.ets2Path', found, vscode.ConfigurationTarget.Global);
	  vscode.window.showInformationMessage(`SCS Toolkit: ETS2 path saved: ${found}`);
	});

  const openResourceCmd = vscode.commands.registerCommand('scsTools.openResource', async (args: any) => {
    try {
      const raw: string = String(args?.raw ?? '');
      const fromPath: string | undefined = args?.from ? String(args.from) : undefined;
      const fromUri = fromPath ? vscode.Uri.file(fromPath) : vscode.window.activeTextEditor?.document.uri;
      const fromDir = fromUri ? path.dirname(fromUri.fsPath) : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd());

    const modRoot = getModRoot() ?? (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd());
    const gameDataRoot = getGameDataPath();

      const cleaned = raw.replace(/^['\"]|['\"]$/g, '');
      if (!cleaned) return;

      const candidates: string[] = [];
      const push = (p: string | undefined) => {
        if (!p) return;
        candidates.push(p);
      };

      // Windows absolute path
      if (/^[a-zA-Z]:[\/]/.test(cleaned)) {
        push(cleaned);
      } else if (cleaned.startsWith('/')) {
        const rel = cleaned.replace(/^\//, '');
        push(path.join(modRoot, rel));
        if (gameDataRoot) push(path.join(gameDataRoot, rel));
      } else {
        // Relative path
        if (cleaned.startsWith('./') || cleaned.startsWith('../')) {
          push(path.resolve(fromDir, cleaned));
        }
        push(path.resolve(fromDir, cleaned));
        push(path.join(modRoot, cleaned));
        if (gameDataRoot) push(path.join(gameDataRoot, cleaned));
      }

      // Try open first existing candidate
      for (const fsPath of candidates) {
        try {
          if (fs.existsSync(fsPath) && fs.statSync(fsPath).isFile()) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fsPath));
            await vscode.window.showTextDocument(doc, { preview: false });
            return;
          }
        } catch { /* ignore */ }
      }

      // Fallback: search in workspace by filename
      const base = path.basename(cleaned.replace(/^\//, ''));
      if (base) {
        const matches = await vscode.workspace.findFiles(`**/${base}`, '**/node_modules/**', 50);
        if (matches.length) {
          const doc = await vscode.workspace.openTextDocument(matches[0]);
          await vscode.window.showTextDocument(doc, { preview: false });
          return;
        }
      }

      vscode.window.showWarningMessage(`SCS Toolkit: fichier introuvable pour: ${cleaned}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`SCS Toolkit: erreur d'ouverture: ${String(err?.message ?? err)}`);
    }
  });

  const linkProvider = vscode.languages.registerDocumentLinkProvider('scs', {
    provideDocumentLinks(document) {
      const links: vscode.DocumentLink[] = [];
      const text = document.getText();

      // Paths we want to turn into links (quoted OR unquoted).
      const exts = '(sui|sii|mat|tobj|dds|tga|png|jpg|jpeg|ogg|wav|bank|pmd|pmg|pma|ppd|ppm|smd|obj|i3d|xml|json)';

      // 1) Quoted paths: ".../file.ext"
      const quotedRe = new RegExp(`(["'])([^"']+\\.${exts})\\1`, 'gi');
      // 2) Unquoted paths after ':' or whitespace: /path/to/file.ext
      const unquotedAbsRe = new RegExp(`(?:^|[\\s:])(\\/[^\\s"']+\\.${exts})`, 'gim');
      // 3) Relative unquoted paths containing '/': path/to/file.ext
      const unquotedRelRe = new RegExp(`(?:^|[\\s:])([^\\/\\s"'][^\\s"']*\\/[^\\s"']+\\.${exts})`, 'gim');

      const makeCmdUri = (raw: string) => {
        const payload = encodeURIComponent(JSON.stringify({ raw, from: document.uri.fsPath }));
        return vscode.Uri.parse(`command:scsTools.openResource?${payload}`);
      };

      const addLink = (start: number, end: number, raw: string) => {
        const range = new vscode.Range(document.positionAt(start), document.positionAt(end));
        const link = new vscode.DocumentLink(range, makeCmdUri(raw));
        link.tooltip = 'Ouvrir la ressource (mod / game data / workspace)';
        links.push(link);
      };

      let m: RegExpExecArray | null;

      // Quoted
      quotedRe.lastIndex = 0;
      while ((m = quotedRe.exec(text)) !== null) {
        const raw = m[2];
        const start = m.index + 1; // skip quote
        const end = start + raw.length;
        addLink(start, end, raw);
      }

      // Unquoted absolute
      unquotedAbsRe.lastIndex = 0;
      while ((m = unquotedAbsRe.exec(text)) !== null) {
        const raw = m[1];
        const start = m.index + m[0].lastIndexOf(raw);
        const end = start + raw.length;
        addLink(start, end, raw);
      }

      // Unquoted relative
      unquotedRelRe.lastIndex = 0;
      while ((m = unquotedRelRe.exec(text)) !== null) {
        const raw = m[1];
        const start = m.index + m[0].lastIndexOf(raw);
        const end = start + raw.length;
        addLink(start, end, raw);
      }

      return links;
    }
  });



  // -------- Color decorator & picker (RGB/RGBA tuples + HEX) --------
  // Supports values like:
  //   key_color: (0.320000, 0.010000, 0.060000)
  //   key_color: (0.320000, 0.010000, 0.060000, 1.000000)
  //   key_color: "#FF00CC" or "#FF00CCFF"
  // Shows a color swatch and allows editing via the native VS Code color picker,
  // with multiple presentations (tuple/hex) just like HTML.
  const colorProvider = vscode.languages.registerColorProvider('scs', {
    provideDocumentColors(document) {
      if (!cfg<boolean>('scsTools.enableColorPicker', true)) return [];

      const infos: vscode.ColorInformation[] = [];
      // (r,g,b) or (r,g,b,a) where values are either 0..1 floats or 0..255 ints
      const tupleRe = /\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)(?:\s*,\s*([+-]?\d*\.?\d+))?\s*\)/g;
      // #RRGGBB or #RRGGBBAA (optionally wrapped in quotes)
      const hexRe = /#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?/g;
      const keyRe = /^\s*([A-Za-z_][\w]*)(\[\])?\s*:/;

      for (let lineNo = 0; lineNo < document.lineCount; lineNo++) {
        const line = document.lineAt(lineNo).text;
        if (isCommentOrEmpty(line)) continue;

        const km = keyRe.exec(line);
        if (!km) continue;

        const key = km[1];
        if (!/colou?r/i.test(key)) continue; // keep it strict to avoid false positives

        // Tuples
        let m: RegExpExecArray | null;
        while ((m = tupleRe.exec(line)) !== null) {
          const r = parseFloat(m[1]);
          const g = parseFloat(m[2]);
          const b = parseFloat(m[3]);
          const aRaw = m[4] !== undefined ? parseFloat(m[4]) : 1;

          if (!isFinite(r) || !isFinite(g) || !isFinite(b) || !isFinite(aRaw)) continue;

          // Detect scale: if any component > 1, assume 0..255 range
          const scale255 = Math.max(r, g, b, aRaw) > 1.0;

          const rr = clamp01(scale255 ? r / 255 : r);
          const gg = clamp01(scale255 ? g / 255 : g);
          const bb = clamp01(scale255 ? b / 255 : b);
          const aa = clamp01(scale255 ? aRaw / 255 : aRaw);

          const start = m.index;
          const end = start + m[0].length;
          const range = new vscode.Range(lineNo, start, lineNo, end);
          infos.push(new vscode.ColorInformation(range, new vscode.Color(rr, gg, bb, aa)));
        }

        // HEX (#RRGGBB / #RRGGBBAA)
        let h: RegExpExecArray | null;
        while ((h = hexRe.exec(line)) !== null) {
          const hex6 = h[1];
          const hexA = h[2];
          const rr = parseInt(hex6.slice(0, 2), 16) / 255;
          const gg = parseInt(hex6.slice(2, 4), 16) / 255;
          const bb = parseInt(hex6.slice(4, 6), 16) / 255;
          const aa = hexA ? parseInt(hexA, 16) / 255 : 1;
          if (![rr, gg, bb, aa].every(v => isFinite(v))) continue;

          const start = h.index;
          const end = start + h[0].length;
          const range = new vscode.Range(lineNo, start, lineNo, end);
          infos.push(new vscode.ColorInformation(range, new vscode.Color(clamp01(rr), clamp01(gg), clamp01(bb), clamp01(aa))));
        }
      }

      return infos;
    },

    provideColorPresentations(color, context) {
      const original = context.document.getText(context.range).trim();
      const preferHex = original.includes('#');

      // Detect if the original was 0..255 tuples
      const has255 = (() => {
        const mm = original.match(/[+-]?\d*\.?\d+/g);
        if (!mm || mm.length < 3) return false;
        const nums = mm.slice(0, Math.min(mm.length, 4)).map(n => parseFloat(n));
        return nums.some(n => n > 1.0);
      })();

      // Detect whether the original explicitly had an alpha component
      const hadTupleAlpha = (() => {
        const mm = original.match(/[+-]?\d*\.?\d+/g);
        return !!mm && mm.length >= 4 && original.startsWith('(');
      })();

      const hadHexAlpha = /#(?:[0-9a-fA-F]{8})/.test(original);

      const fmtFloat = (v: number) => v.toFixed(6);
      const to255 = (v: number) => Math.round(clamp01(v) * 255);
      const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

      // Tuple presentations
      const rT = has255 ? to255(color.red) : color.red;
      const gT = has255 ? to255(color.green) : color.green;
      const bT = has255 ? to255(color.blue) : color.blue;
      const aT = has255 ? to255(color.alpha) : color.alpha;

      const tupleRGB = has255
        ? `(${rT}, ${gT}, ${bT})`
        : `(${fmtFloat(rT)}, ${fmtFloat(gT)}, ${fmtFloat(bT)})`;

      const tupleRGBA = has255
        ? `(${rT}, ${gT}, ${bT}, ${aT})`
        : `(${fmtFloat(rT)}, ${fmtFloat(gT)}, ${fmtFloat(bT)}, ${fmtFloat(aT)})`;

      // Hex presentations (default: #RRGGBB and #RRGGBBAA)
      const rH = hex2(to255(color.red));
      const gH = hex2(to255(color.green));
      const bH = hex2(to255(color.blue));
      const aH = hex2(to255(color.alpha));
      const hexRGB = `#${rH}${gH}${bH}`;
      const hexRGBA = `#${rH}${gH}${bH}${aH}`;

      // Decide which ones to show by default: preserve original style but also offer alternatives.
      const presentations: vscode.ColorPresentation[] = [];

      const wantsAlpha = hadTupleAlpha || hadHexAlpha || color.alpha < 0.999;

      if (preferHex) {
        presentations.push(new vscode.ColorPresentation(wantsAlpha ? hexRGBA : hexRGB));
        presentations.push(new vscode.ColorPresentation(wantsAlpha ? tupleRGBA : tupleRGB));
      } else {
        presentations.push(new vscode.ColorPresentation(wantsAlpha ? tupleRGBA : tupleRGB));
        presentations.push(new vscode.ColorPresentation(wantsAlpha ? hexRGBA : hexRGB));
      }

      // Always provide both alpha/non-alpha variants (handy for beginners)
      if (!wantsAlpha) {
        presentations.push(new vscode.ColorPresentation(tupleRGBA));
        presentations.push(new vscode.ColorPresentation(hexRGBA));
      } else {
        presentations.push(new vscode.ColorPresentation(tupleRGB));
        presentations.push(new vscode.ColorPresentation(hexRGB));
      }

      // De-duplicate by label
      const seen = new Set<string>();
      return presentations.filter(p => {
        const l = p.label;
        if (seen.has(l)) return false;
        seen.add(l);
        return true;
      });

    }
  });

  // Inline RGB(A) text coloring (similar feeling to HTML color literals)
	const inlineDecos = new Map<string, vscode.TextEditorDecorationType>();
	const getDeco = (rgba: string) => {
	  let d = inlineDecos.get(rgba);
	  if (!d) {
	    d = vscode.window.createTextEditorDecorationType({ color: rgba });
	    inlineDecos.set(rgba, d);
	  }
	  return d;
	};

		const updateInlineColors = (editor?: vscode.TextEditor) => {
		  const e = editor || vscode.window.activeTextEditor;
		  if (!e || e.document.languageId !== 'scs') return;
		  if (!cfg<boolean>('scsTools.enableInlineColorText', false)) {
		    for (const deco of inlineDecos.values()) e.setDecorations(deco, []);
		    return;
		  }

		  // Clear all first
	  for (const deco of inlineDecos.values()) e.setDecorations(deco, []);

	  const doc = e.document;
	  const tupleRe = /\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)(?:\s*,\s*([+-]?\d*\.?\d+))?\s*\)/g;
	  const hexRe = /#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?/g;
	  const keyRe = /^\s*([A-Za-z_][\w]*)(\[\])?\s*:/;

	  const buckets = new Map<string, vscode.Range[]>();
	  const push = (rgba: string, range: vscode.Range) => {
	    const arr = buckets.get(rgba) || [];
	    arr.push(range);
	    buckets.set(rgba, arr);
	  };

	  for (let lineNo = 0; lineNo < doc.lineCount; lineNo++) {
	    const line = doc.lineAt(lineNo).text;
	    if (isCommentOrEmpty(line)) continue;

	    const km = keyRe.exec(line);
	    if (!km) continue;
	    const key = km[1];
	    if (!/colou?r/i.test(key)) continue;

	    let m: RegExpExecArray | null;
	    while ((m = tupleRe.exec(line)) !== null) {
	      const r = parseFloat(m[1]);
	      const g = parseFloat(m[2]);
	      const b = parseFloat(m[3]);
	      const aRaw = m[4] !== undefined ? parseFloat(m[4]) : 1;
	      if (![r,g,b,aRaw].every(v => isFinite(v))) continue;
	      const scale255 = Math.max(r, g, b, aRaw) > 1.0;
	      const rr = clamp01(scale255 ? r / 255 : r);
	      const gg = clamp01(scale255 ? g / 255 : g);
	      const bb = clamp01(scale255 ? b / 255 : b);
	      const aa = clamp01(scale255 ? aRaw / 255 : aRaw);
	      const rgba = `rgba(${Math.round(rr*255)}, ${Math.round(gg*255)}, ${Math.round(bb*255)}, ${aa.toFixed(3)})`;
	      // Color only the numeric part (without parentheses)
	      const start = m.index + 1;
	      const end = m.index + m[0].length - 1;
	      push(rgba, new vscode.Range(lineNo, start, lineNo, end));
	    }

	    let h: RegExpExecArray | null;
	    while ((h = hexRe.exec(line)) !== null) {
	      const hex6 = h[1];
	      const hexA = h[2];
	      const rr = parseInt(hex6.slice(0, 2), 16);
	      const gg = parseInt(hex6.slice(2, 4), 16);
	      const bb = parseInt(hex6.slice(4, 6), 16);
	      const aa = hexA ? parseInt(hexA, 16) / 255 : 1;
	      if (![rr,gg,bb,aa].every(v => isFinite(v as any))) continue;
	      const rgba = `rgba(${rr}, ${gg}, ${bb}, ${aa.toFixed(3)})`;
	      const start = h.index;
	      const end = start + h[0].length;
	      push(rgba, new vscode.Range(lineNo, start, lineNo, end));
	    }
	  }

	  for (const [rgba, ranges] of buckets.entries()) {
	    e.setDecorations(getDeco(rgba), ranges);
	  }
	};

	let inlineTimer: NodeJS.Timeout | undefined;
	const scheduleInlineUpdate = () => {
	  if (inlineTimer) clearTimeout(inlineTimer);
	  inlineTimer = setTimeout(() => updateInlineColors(), 120);
	};

	// Update when switching editors or changing the active document
	context.subscriptions.push(
	  vscode.window.onDidChangeActiveTextEditor(() => scheduleInlineUpdate()),
	  vscode.workspace.onDidChangeTextDocument((e) => {
	    if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) scheduleInlineUpdate();
	  })
	);

	// Initial paint
	scheduleInlineUpdate();

  // -------- Diagnostics (unknown keys) --------
  const diagnostics = vscode.languages.createDiagnosticCollection('scsTools');

  function validate(document: vscode.TextDocument) {
    if (document.languageId !== 'scs') return;

    // Keep diagnostics focused: SII files (especially manifest.sii / def/*.sii).
    // SUI/MAT often contain many project-specific keys and this would create noise.
    const ext = path.extname(document.fileName).toLowerCase();
    if (ext !== '.sii') {
      diagnostics.set(document.uri, []);
      return;
    }
    if (!cfg<boolean>('scsTools.enableDiagnostics', true)) {
      diagnostics.set(document.uri, []);
      return;
    }

    const diags: vscode.Diagnostic[] = [];
    const keyRe = /^\s*([A-Za-z_][\w]*)(\[\])?\s*:/;

    for (let i = 0; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;
      if (isCommentOrEmpty(text)) continue;
      const t = text.trim();
      if (t.startsWith('@')) continue;
      if (t.startsWith('SiiNunit')) continue;
      if (t.startsWith('{') || t.startsWith('}')) continue;

      const m = keyRe.exec(text);
      if (!m) continue;

      const key = m[1];
      // ignore unit headers like: accessory_addon_data : something
      if (!RESERVED_SET.has(key)) {
        const start = text.indexOf(key);
        const range = new vscode.Range(i, start, i, start + key.length);
        diags.push(
          new vscode.Diagnostic(
            range,
            `Unknown SCS key: "${key}" (you can disable this warning in settings: scsTools.enableDiagnostics).`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }

    diagnostics.set(document.uri, diags);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(validate),
    vscode.workspace.onDidChangeTextDocument(e => validate(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri)),
    diagnostics
  );

  // -------- Formatter (SCS Script / SII / SUI) --------
	// Provides a consistent, readable formatting for SCS Script files and can optionally run automatically on save.
	type FormatOpts = {
		enabled: boolean;
		onSave: boolean;
		alignColons: boolean;
		maxEmptyLines: number;
		trimTrailingWhitespace: boolean;
		spaceAfterCommaInTuples: boolean;
		indent: string;
	};

	const getFormatOpts = (): FormatOpts => ({
		enabled: cfg<boolean>("scsTools.enableFormatter", true),
		onSave: cfg<boolean>("scsTools.format.onSave", false),
		alignColons: cfg<boolean>("scsTools.format.alignColons", true),
		maxEmptyLines: Math.max(0, Math.min(10, cfg<number>("scsTools.format.maxEmptyLines", 1))),
		trimTrailingWhitespace: cfg<boolean>("scsTools.format.trimTrailingWhitespace", true),
		spaceAfterCommaInTuples: cfg<boolean>("scsTools.format.spaceAfterCommaInTuples", true),
		indent: cfg<string>("scsTools.format.indent", "\t"),
	});

	function formatScsText(input: string, opts: FormatOpts): string {
		const lines = input.split(/\r?\n/);

		let level = 0;
		let emptyRun = 0;

		type KV = { indentStr: string; key: string; value: string; level: number };
		let group: KV[] = [];
		let groupLevel: number | null = null;

		const out: string[] = [];

		const flushGroup = () => {
			if (group.length === 0) return;
			if (opts.alignColons) {
				const maxKey = Math.max(...group.map((g) => g.key.length));
				for (const g of group) {
					const paddedKey = g.key.padEnd(maxKey, " ");
					out.push(`${g.indentStr}${paddedKey}: ${g.value}`.trimEnd());
				}
			} else {
				for (const g of group) out.push(`${g.indentStr}${g.key}: ${g.value}`.trimEnd());
			}
			group = [];
			groupLevel = null;
		};

		const isComment = (t: string) => t.startsWith("#") || t.startsWith("//");
		const isDirective = (t: string) => t.startsWith("@");
		const kvRe = /^([A-Za-z_][A-Za-z0-9_\.\-]*(?:\[\])?)\s*:\s*(.*)$/;

		for (let i = 0; i < lines.length; i++) {
			let raw = lines[i] ?? "";
			if (opts.trimTrailingWhitespace) raw = raw.replace(/[ \t]+$/g, "");

			const trimmed = raw.trim();

			// blank line
			if (trimmed.length === 0) {
				flushGroup();
				emptyRun++;
				if (emptyRun <= opts.maxEmptyLines) out.push("");
				continue;
			}
			emptyRun = 0;

			// dedent if line begins with a closing brace
			if (trimmed.startsWith("}")) level = Math.max(0, level - 1);

			const indentStr = opts.indent.repeat(level);

			// Keep these lines as-is (but normalized indentation)
			if (trimmed === "SiiNunit" || trimmed === "SiiNunit{" || trimmed === "SiiNunit {") {
				flushGroup();
				out.push("SiiNunit");
				continue;
			}

			if (trimmed === "{" || trimmed === "}" || isComment(trimmed) || isDirective(trimmed)) {
				flushGroup();
				out.push(`${indentStr}${trimmed}`);
				if (trimmed.endsWith("{")) level++;
				continue;
			}

			// Normalize key/value lines and optionally align groups
			const m = kvRe.exec(trimmed);
			if (m) {
				let key = m[1];
				let value = (m[2] ?? "").trim();

				// Normalize tuples: (a,b,c) -> (a, b, c)
				if (opts.spaceAfterCommaInTuples) {
					const tuple = /^\((.*)\)$/.exec(value);
					if (tuple) {
						const inner = tuple[1];
						const parts = inner.split(",").map((p) => p.trim());
						value = `(${parts.join(", ")})`;
					}
				}

				if (groupLevel === null) {
					groupLevel = level;
					group.push({ indentStr, key, value, level });
				} else if (groupLevel === level) {
					group.push({ indentStr, key, value, level });
				} else {
					flushGroup();
					groupLevel = level;
					group.push({ indentStr, key, value, level });
				}

				// If this key/value line opens a block, flush and increase indentation
				if (value.endsWith("{")) {
					flushGroup();
					// ensure spacing before '{' is correct: "key: value {"
					out[out.length - 1] = out[out.length - 1].replace(/\s*\{$/, " {");
					level++;
				}
				continue;
			}

			// Other statements: keep but normalize indentation/spacing
			flushGroup();
			out.push(`${indentStr}${trimmed}`);

			// indent after opening brace at end of line
			if (trimmed.endsWith("{")) level++;
		}

		flushGroup();
		return out.join("\n");
	}

	function makeFullReplaceEdits(document: vscode.TextDocument, newText: string): vscode.TextEdit[] {
		const last = document.lineAt(document.lineCount - 1);
		const fullRange = new vscode.Range(0, 0, document.lineCount - 1, last.text.length);
		return [vscode.TextEdit.replace(fullRange, newText)];
	}

	const formatProvider = vscode.languages.registerDocumentFormattingEditProvider("scs", {
		provideDocumentFormattingEdits(document) {
			const opts = getFormatOpts();
			if (!opts.enabled) return [];
			const newText = formatScsText(document.getText(), opts);
			if (newText === document.getText()) return [];
			return makeFullReplaceEdits(document, newText);
		},
	});

	context.subscriptions.push(formatProvider);

	// Optional "auto format on save" (scoped to SCS documents only)
	context.subscriptions.push(
		vscode.workspace.onWillSaveTextDocument((e) => {
			const opts = getFormatOpts();
			if (!opts.enabled || !opts.onSave) return;
			if (e.document.languageId !== "scs") return;
			e.waitUntil(
				Promise.resolve().then(() => {
					const newText = formatScsText(e.document.getText(), opts);
					if (newText === e.document.getText()) return [];
					return makeFullReplaceEdits(e.document, newText);
				})
			);
		})
	);

	// Optional explicit command (useful if users don't have "Format Document" bound)
	const formatCommand = vscode.commands.registerCommand("scsTools.formatDocument", async () => {
		const ed = vscode.window.activeTextEditor;
		if (!ed) return;
		if (ed.document.languageId !== "scs") return;
		await vscode.commands.executeCommand("editor.action.formatDocument");
	});
	context.subscriptions.push(formatCommand);


  // Register remaining disposables (providers/commands)
  context.subscriptions.push(linkProvider, colorProvider, hoverProvider, openResourceCmd, detectCmd);

  // Cleanup for inline decorations / timer
  context.subscriptions.push({
    dispose: () => {
      try { clearTimeout(inlineTimer); } catch {}
      for (const deco of inlineDecos.values()) {
        try { deco.dispose(); } catch {}
      }
      inlineDecos.clear();
    }
  });
}

export function deactivate() {}
