"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectScanner = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
const child_process_1 = require("child_process");
class ProjectScanner {
    context;
    globalRegistryPath;
    removedProjectsPath;
    agyProjectsDir;
    constructor(context) {
        this.context = context;
        const geminiDir = path.join(os.homedir(), '.gemini');
        this.globalRegistryPath = path.join(geminiDir, 'dino-dashboard-projects.json');
        this.removedProjectsPath = path.join(geminiDir, 'dino-dashboard-removed.json');
        this.agyProjectsDir = path.join(geminiDir, 'config', 'projects');
    }
    normalizePathKey(p) {
        return path.resolve(p).toLowerCase();
    }
    getRemovedProjects() {
        const list = this.context.globalState.get('dinoDashboard.removedProjects') || [];
        const set = new Set(list.map(p => this.normalizePathKey(p)));
        if (fs.existsSync(this.removedProjectsPath)) {
            try {
                const raw = fs.readFileSync(this.removedProjectsPath, 'utf8');
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    for (const p of arr) {
                        if (p && typeof p === 'string') {
                            set.add(this.normalizePathKey(p));
                        }
                    }
                }
            }
            catch { }
        }
        return set;
    }
    saveRemovedProjects(set) {
        const arr = Array.from(set);
        try {
            this.context.globalState.update('dinoDashboard.removedProjects', arr);
        }
        catch { }
        try {
            const dir = path.dirname(this.removedProjectsPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.removedProjectsPath, JSON.stringify(arr, null, 2), 'utf8');
        }
        catch (e) {
            console.warn('Konnte gelöschte Projekte nicht speichern:', e);
        }
    }
    /**
     * Lädt alle gespeicherten Projekte aus der globalen Datei + globalState
     * und synchronisiert automatisch bestehende Antigravity-Projekte & offene Workspace-Ordner.
     */
    getSavedRegistry() {
        let registry = {};
        const removed = this.getRemovedProjects();
        // 1. Aus VS Code globalState laden
        const fromState = this.context.globalState.get('dinoDashboard.projects');
        if (fromState && typeof fromState === 'object') {
            registry = { ...fromState };
        }
        // 2. Aus ~/.gemini/dino-dashboard-projects.json laden (überlebt selbst Neuinstallationen)
        if (fs.existsSync(this.globalRegistryPath)) {
            try {
                const raw = fs.readFileSync(this.globalRegistryPath, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    for (const [k, v] of Object.entries(parsed)) {
                        registry[k] = { ...(registry[k] || {}), ...v };
                    }
                }
            }
            catch (e) {
                console.warn('Fehler beim Lesen der globalen Dino-Projektliste:', e);
            }
        }
        let changed = false;
        // Gelöschte Projekte konsequent aus der Registry entfernen
        for (const k of Object.keys(registry)) {
            if (removed.has(k)) {
                delete registry[k];
                changed = true;
            }
        }
        // 3. Bestehende Antigravity-Projekte aus ~/.gemini/config/projects/*.json importieren (nur wenn nicht gelöscht)
        if (fs.existsSync(this.agyProjectsDir)) {
            try {
                const files = fs.readdirSync(this.agyProjectsDir);
                for (const file of files) {
                    if (!file.endsWith('.json') || file === 'default-cli-project.json' || file === 'outside-of-project.json') {
                        continue;
                    }
                    const fullPath = path.join(this.agyProjectsDir, file);
                    try {
                        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                        const resList = content?.projectResources?.resources;
                        if (Array.isArray(resList) && resList.length > 0 && resList[0].folderUri) {
                            const uri = vscode.Uri.parse(resList[0].folderUri);
                            const fsPath = uri.fsPath;
                            if (fsPath && fs.existsSync(fsPath)) {
                                const key = this.normalizePathKey(fsPath);
                                if (!removed.has(key) && !registry[key]) {
                                    const folderBase = path.basename(fsPath);
                                    registry[key] = {
                                        folderPath: fsPath,
                                        folderUri: vscode.Uri.file(fsPath).toString(),
                                        customName: content.name && content.name !== folderBase ? content.name : undefined,
                                        addedAt: Date.now()
                                    };
                                    changed = true;
                                }
                            }
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }
        // 4. Aktuell geöffnete Workspace-Ordner automatisch aufnehmen (nur wenn nicht gelöscht)
        const openFolders = vscode.workspace.workspaceFolders || [];
        for (const folder of openFolders) {
            const fsPath = folder.uri.fsPath;
            if (fsPath && fs.existsSync(fsPath)) {
                const key = this.normalizePathKey(fsPath);
                if (!removed.has(key)) {
                    if (!registry[key]) {
                        registry[key] = {
                            folderPath: fsPath,
                            folderUri: vscode.Uri.file(fsPath).toString(),
                            addedAt: Date.now(),
                            lastOpened: Date.now()
                        };
                        changed = true;
                    }
                    else {
                        registry[key].lastOpened = Date.now();
                    }
                }
            }
        }
        if (changed) {
            this.saveRegistry(registry);
        }
        return registry;
    }
    saveRegistry(registry) {
        try {
            this.context.globalState.update('dinoDashboard.projects', registry);
        }
        catch { }
        try {
            const dir = path.dirname(this.globalRegistryPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.globalRegistryPath, JSON.stringify(registry, null, 2), 'utf8');
        }
        catch (e) {
            console.warn('Konnte globale Dino-Projektliste nicht speichern:', e);
        }
    }
    /**
     * Fügt einen neuen Projektordner zur Liste hinzu und registriert ihn in Antigravity.
     */
    async addProjectFolder(fsPath) {
        if (!fsPath || !fs.existsSync(fsPath)) {
            return null;
        }
        const resolved = path.resolve(fsPath);
        const key = this.normalizePathKey(resolved);
        // Falls das Projekt zuvor als gelöscht markiert war, wieder aktivieren
        const removed = this.getRemovedProjects();
        if (removed.has(key)) {
            removed.delete(key);
            this.saveRemovedProjects(removed);
        }
        const registry = this.getSavedRegistry();
        const existing = registry[key] || {
            folderPath: resolved,
            folderUri: vscode.Uri.file(resolved).toString(),
            addedAt: Date.now()
        };
        existing.folderPath = resolved;
        existing.folderUri = vscode.Uri.file(resolved).toString();
        registry[key] = existing;
        this.saveRegistry(registry);
        this.ensureAntigravityProjectRegistered(resolved, existing.customName || path.basename(resolved));
        return existing;
    }
    /**
     * Entfernt ein Projekt aus der gespeicherten Dashboard-Liste (löscht KEINE Dateien auf der Festplatte).
     */
    async removeProjectFolder(idOrPath) {
        let targetPath = idOrPath;
        if (idOrPath.startsWith('file://')) {
            targetPath = vscode.Uri.parse(idOrPath).fsPath;
        }
        const resolved = path.resolve(targetPath);
        const key = this.normalizePathKey(resolved);
        // 1. In removedProjects aufnehmen (verhindert automatisches Wiedererscheinen)
        const removed = this.getRemovedProjects();
        removed.add(key);
        this.saveRemovedProjects(removed);
        // 2. Aus Registry entfernen
        const registry = this.getSavedRegistry();
        if (registry[key]) {
            delete registry[key];
            this.saveRegistry(registry);
        }
        // 3. Aus ~/.gemini/config/projects/*.json entfernen
        try {
            if (fs.existsSync(this.agyProjectsDir)) {
                const files = fs.readdirSync(this.agyProjectsDir);
                for (const file of files) {
                    if (!file.endsWith('.json'))
                        continue;
                    const fullPath = path.join(this.agyProjectsDir, file);
                    try {
                        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                        const resList = data?.projectResources?.resources;
                        if (Array.isArray(resList) && resList.length > 0 && resList[0].folderUri) {
                            const existingPath = vscode.Uri.parse(resList[0].folderUri).fsPath;
                            if (existingPath && this.normalizePathKey(existingPath) === key) {
                                fs.unlinkSync(fullPath);
                            }
                        }
                    }
                    catch { }
                }
            }
        }
        catch { }
    }
    /**
     * Scannt einen Überordner (z. B. H:\) nach direkten Unterordnern und fügt sie als Projekte hinzu.
     */
    async scanParentDirectory(parentPath, ignoredFolders) {
        if (!parentPath || !fs.existsSync(parentPath)) {
            return 0;
        }
        const ignoredSet = new Set(ignoredFolders.map(f => f.toLowerCase()));
        ignoredSet.add('$recycle.bin');
        ignoredSet.add('system volume information');
        ignoredSet.add('recovery');
        ignoredSet.add('msocache');
        let addedCount = 0;
        const registry = this.getSavedRegistry();
        try {
            const entries = fs.readdirSync(parentPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                const name = entry.name;
                if (name.startsWith('.') || name.startsWith('$') || ignoredSet.has(name.toLowerCase())) {
                    continue;
                }
                const fullPath = path.resolve(parentPath, name);
                const key = this.normalizePathKey(fullPath);
                if (!registry[key]) {
                    registry[key] = {
                        folderPath: fullPath,
                        folderUri: vscode.Uri.file(fullPath).toString(),
                        addedAt: Date.now()
                    };
                    this.ensureAntigravityProjectRegistered(fullPath, name);
                    addedCount++;
                }
            }
            if (addedCount > 0) {
                this.saveRegistry(registry);
            }
        }
        catch (e) {
            console.warn('Fehler beim Scannen des Überordners:', e);
        }
        return addedCount;
    }
    /**
     * Synchronisiert das Projekt mit ~/.gemini/config/projects/, damit Antigravity es sofort kennt.
     */
    ensureAntigravityProjectRegistered(fsPath, projectName) {
        try {
            if (!fs.existsSync(this.agyProjectsDir)) {
                fs.mkdirSync(this.agyProjectsDir, { recursive: true });
            }
            const targetUri = vscode.Uri.file(fsPath).toString();
            const normalizedTarget = this.normalizePathKey(fsPath);
            // Prüfen, ob bereits eine Projekt-JSON für diesen Pfad existiert
            const files = fs.readdirSync(this.agyProjectsDir);
            for (const file of files) {
                if (!file.endsWith('.json'))
                    continue;
                const fullPath = path.join(this.agyProjectsDir, file);
                try {
                    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                    const resList = data?.projectResources?.resources;
                    if (Array.isArray(resList) && resList.length > 0 && resList[0].folderUri) {
                        const existingPath = vscode.Uri.parse(resList[0].folderUri).fsPath;
                        if (existingPath && this.normalizePathKey(existingPath) === normalizedTarget) {
                            if (data.name !== projectName) {
                                data.name = projectName;
                                fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
                            }
                            return;
                        }
                    }
                }
                catch { }
            }
            // Falls noch nicht vorhanden: Neue Antigravity-Projektdatei anlegen
            const id = crypto.randomUUID();
            const newProjectConfig = {
                id,
                name: projectName,
                projectResources: {
                    resources: [
                        {
                            folderUri: targetUri
                        }
                    ]
                },
                permissionGrants: {
                    v2Migrated: true
                },
                settings: {},
                isWorkspaceOnly: false
            };
            fs.writeFileSync(path.join(this.agyProjectsDir, `${id}.json`), JSON.stringify(newProjectConfig, null, 2), 'utf8');
        }
        catch (e) {
            console.warn('Konnte Antigravity-Projektkonfiguration nicht aktualisieren:', e);
        }
    }
    /**
     * Scannt alle gespeicherten und aktuell geöffneten Projekte.
     */
    async scanAll(settings) {
        const registry = this.getSavedRegistry();
        const openFolders = vscode.workspace.workspaceFolders || [];
        const activePaths = new Set(openFolders.map(f => this.normalizePathKey(f.uri.fsPath)));
        const removed = this.getRemovedProjects();
        const entries = Object.values(registry).filter(e => e.folderPath && fs.existsSync(e.folderPath) && !removed.has(this.normalizePathKey(e.folderPath)));
        const projects = [];
        for (const entry of entries) {
            try {
                const isActive = activePaths.has(this.normalizePathKey(entry.folderPath));
                const metadata = await this.scanFolderPath(entry.folderPath, settings, isActive);
                projects.push(metadata);
            }
            catch (err) {
                console.error(`Fehler beim Scannen von ${entry.folderPath}:`, err);
                projects.push(this.getFallbackMetadata(entry.folderPath, activePaths.has(this.normalizePathKey(entry.folderPath))));
            }
        }
        // Sortieren: Aktive Projekte im Workspace zuerst, danach Favoriten (⭐), danach alphabetisch
        projects.sort((a, b) => {
            if (a.isActiveWorkspace && !b.isActiveWorkspace)
                return -1;
            if (!a.isActiveWorkspace && b.isActiveWorkspace)
                return 1;
            if (a.isFavorite && !b.isFavorite)
                return -1;
            if (!a.isFavorite && b.isFavorite)
                return 1;
            return a.name.localeCompare(b.name, 'de');
        });
        return projects;
    }
    /**
     * Scannt einen einzelnen Projektordner anhand seines Dateisystempfads.
     */
    async scanFolderPath(rootPath, settings, isActiveWorkspace) {
        const folderName = path.basename(rootPath);
        const folderUri = vscode.Uri.file(rootPath).toString();
        const ignoredSet = new Set(settings.ignoredFolders.map(f => f.toLowerCase()));
        // 1. Gespeicherte Benutzerdaten laden (eigener Name, eigene Beschreibung, Notizen, Tags)
        const persisted = await this.loadPersistedDataByPath(rootPath);
        // 2. Manifest-Dateien & Tech-Stack analysieren
        const { manifestDescription, manifestTags } = await this.parseManifests(rootPath);
        // 3. README prüfen
        const readmeInfo = await this.checkReadme(rootPath, folderName);
        // 4. Tech-Stack & wichtige Ordner ermitteln
        const techStack = await this.detectTechStack(rootPath, manifestTags);
        const keyDirectories = await this.getKeyDirectories(rootPath, ignoredSet);
        const stats = await this.getStats(rootPath, ignoredSet);
        // 5. Automatische Beschreibung auf Deutsch generieren (aus README, Manifesten oder Ordnerinhalt)
        const autoDescription = await this.buildSmartDescription(rootPath, folderName, readmeInfo.summary, manifestDescription, techStack, keyDirectories, stats);
        // Der Projektname übernimmt standardmäßig den Ordnernamen, sofern kein eigener Name vergeben wurde
        const finalName = (persisted.customName && persisted.customName.trim())
            ? persisted.customName.trim()
            : folderName;
        // Die Beschreibung nutzt die eigene Beschreibung (falls bearbeitet) oder die automatisch erkannte
        const finalDescription = (persisted.customDescription && persisted.customDescription.trim())
            ? persisted.customDescription.trim()
            : autoDescription;
        // 6. Projekt-Zustand (Health Check auf Deutsch)
        const health = this.evaluateHealth(rootPath, readmeInfo.hasReadme, stats, techStack);
        return {
            id: folderUri,
            name: finalName,
            folderName,
            customName: persisted.customName,
            folderUri,
            folderPath: rootPath,
            description: finalDescription,
            autoDescription,
            customDescription: persisted.customDescription,
            isActiveWorkspace,
            isFavorite: !!persisted.isFavorite,
            techStack,
            stats,
            hasReadme: readmeInfo.hasReadme,
            readmeUri: readmeInfo.uri?.toString(),
            customNotes: persisted.notes,
            customTags: persisted.tags,
            health,
            keyDirectories,
            lastOpened: persisted.lastOpened
        };
    }
    async parseManifests(rootPath) {
        let manifestDescription = '';
        const manifestTags = [];
        // Node.js package.json
        const packageJsonPath = path.join(rootPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const raw = fs.readFileSync(packageJsonPath, 'utf8');
                const pkg = JSON.parse(raw);
                if (pkg.description) {
                    manifestDescription = pkg.description;
                }
                manifestTags.push('Node.js');
                const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
                if (allDeps['react'])
                    manifestTags.push('React');
                if (allDeps['next'])
                    manifestTags.push('Next.js');
                if (allDeps['vue'])
                    manifestTags.push('Vue');
                if (allDeps['svelte'] || allDeps['@sveltejs/kit'])
                    manifestTags.push('Svelte');
                if (allDeps['@angular/core'])
                    manifestTags.push('Angular');
                if (allDeps['electron'])
                    manifestTags.push('Electron');
                if (allDeps['vite'])
                    manifestTags.push('Vite');
                if (allDeps['typescript'] || fs.existsSync(path.join(rootPath, 'tsconfig.json'))) {
                    manifestTags.push('TypeScript');
                }
                else {
                    manifestTags.push('JavaScript');
                }
                if (allDeps['express'] || allDeps['koa'] || allDeps['fastify'] || allDeps['nest'] || allDeps['socket.io']) {
                    manifestTags.push('Backend / Server');
                }
                if (allDeps['tailwindcss'])
                    manifestTags.push('TailwindCSS');
                if (pkg.engines && pkg.engines.vscode)
                    manifestTags.push('VS Code Extension');
            }
            catch { }
        }
        // Python pyproject.toml / setup.py / requirements.txt
        const pyprojectPath = path.join(rootPath, 'pyproject.toml');
        if (fs.existsSync(pyprojectPath)) {
            manifestTags.push('Python');
            try {
                const content = fs.readFileSync(pyprojectPath, 'utf8');
                const descMatch = content.match(/description\s*=\s*["']([^"']+)["']/);
                if (descMatch && descMatch[1] && !manifestDescription) {
                    manifestDescription = descMatch[1];
                }
                if (content.includes('fastapi'))
                    manifestTags.push('FastAPI');
                if (content.includes('django'))
                    manifestTags.push('Django');
                if (content.includes('flask'))
                    manifestTags.push('Flask');
                if (content.includes('pygame'))
                    manifestTags.push('Pygame');
                if (content.includes('pyqt') || content.includes('pyside'))
                    manifestTags.push('Qt GUI');
            }
            catch { }
        }
        else if (fs.existsSync(path.join(rootPath, 'requirements.txt')) || fs.existsSync(path.join(rootPath, 'setup.py'))) {
            manifestTags.push('Python');
        }
        // Rust Cargo.toml
        const cargoPath = path.join(rootPath, 'Cargo.toml');
        if (fs.existsSync(cargoPath)) {
            manifestTags.push('Rust');
            try {
                const content = fs.readFileSync(cargoPath, 'utf8');
                const descMatch = content.match(/description\s*=\s*["']([^"']+)["']/);
                if (descMatch && descMatch[1] && !manifestDescription) {
                    manifestDescription = descMatch[1];
                }
            }
            catch { }
        }
        // Go go.mod
        if (fs.existsSync(path.join(rootPath, 'go.mod'))) {
            manifestTags.push('Go');
        }
        return { manifestDescription, manifestTags };
    }
    async checkReadme(rootPath, folderName) {
        const candidates = ['README.md', 'README.MD', 'readme.md', 'README.txt', 'README', ' Liesmich.txt', 'LIESMICH.md'];
        for (const cand of candidates) {
            const p = path.join(rootPath, cand);
            if (fs.existsSync(p)) {
                try {
                    const content = fs.readFileSync(p, 'utf8');
                    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                    let summary = '';
                    const cleanFolder = folderName.toLowerCase().replace(/[-_]/g, ' ');
                    for (const line of lines) {
                        // Markdown-Badges, Bilder, Trennlinien oder HTML-Kommentare überspringen
                        if (line.startsWith('[![') || line.startsWith('![') || line.startsWith('---') || line.startsWith('<!--') || line.startsWith('```')) {
                            continue;
                        }
                        const clean = line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim();
                        // Überschrift überspringen, wenn sie nur den Ordnernamen wiederholt
                        if (line.startsWith('#') && clean.toLowerCase().replace(/[-_]/g, ' ') === cleanFolder) {
                            continue;
                        }
                        if (clean.length > 12) {
                            summary = clean;
                            break;
                        }
                    }
                    return { hasReadme: true, uri: vscode.Uri.file(p), summary };
                }
                catch {
                    return { hasReadme: true, uri: vscode.Uri.file(p) };
                }
            }
        }
        return { hasReadme: false };
    }
    /**
     * Erstellt automatisch eine aussagekräftige deutsche Beschreibung anhand von README,
     * Manifesten, HTML-Titeln, Python-Docstrings oder den vorhandenen Dateien im Ordner.
     */
    async buildSmartDescription(rootPath, folderName, readmeSummary, manifestDescription, techStack, keyDirectories, stats) {
        if (readmeSummary && readmeSummary.length > 10) {
            return readmeSummary;
        }
        if (manifestDescription && manifestDescription.length > 5) {
            return manifestDescription;
        }
        // Prüfe index.html nach <title> oder <meta name="description">
        const indexHtmlPath = path.join(rootPath, 'index.html');
        if (fs.existsSync(indexHtmlPath)) {
            try {
                const html = fs.readFileSync(indexHtmlPath, 'utf8');
                const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
                if (metaMatch && metaMatch[1] && metaMatch[1].trim().length > 5) {
                    return metaMatch[1].trim();
                }
                const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
                if (titleMatch && titleMatch[1]) {
                    const title = titleMatch[1].trim();
                    if (title && title.toLowerCase() !== 'document' && title.toLowerCase() !== 'vite app') {
                        return `Web-Projekt „${title}“ (${techStack.join(', ')}) mit ${stats.fileCount} Dateien.`;
                    }
                }
            }
            catch { }
        }
        // Prüfe wichtige Dateien im Hauptverzeichnis für eine intelligente Inhaltsanalyse
        try {
            const entries = fs.readdirSync(rootPath, { withFileTypes: true });
            const files = entries.filter(e => e.isFile() && !e.name.startsWith('.')).map(e => e.name);
            const lowerFiles = files.map(f => f.toLowerCase());
            // Python-Docstring aus main.py / app.py / gui.py lesen, falls vorhanden
            const pyEntry = files.find(f => ['main.py', 'app.py', 'gui.py', 'bot.py', 'run.py'].includes(f.toLowerCase()))
                || files.find(f => f.endsWith('.py'));
            if (pyEntry) {
                try {
                    const pyContent = fs.readFileSync(path.join(rootPath, pyEntry), 'utf8');
                    const docMatch = pyContent.match(/^(?:#.*\r?\n)*\s*(?:"""|''')([\s\S]*?)(?:"""|''')/);
                    if (docMatch && docMatch[1]) {
                        const firstLine = docMatch[1].split(/\r?\n/).map(l => l.trim()).find(l => l.length > 8);
                        if (firstLine) {
                            return firstLine;
                        }
                    }
                }
                catch { }
            }
            // Projekttyp anhand typischer Dateien bestimmen
            const hasGameFiles = lowerFiles.some(f => f.includes('game') || f.includes('dino') || f.includes('player') || f.includes('sprite'));
            const hasWebFiles = lowerFiles.includes('index.html') || lowerFiles.some(f => f.endsWith('.html') || f.endsWith('.css'));
            const hasPython = lowerFiles.some(f => f.endsWith('.py'));
            const hasCSharp = lowerFiles.some(f => f.endsWith('.cs') || f.endsWith('.csproj') || f.endsWith('.sln'));
            const hasScripts = lowerFiles.some(f => f.endsWith('.ps1') || f.endsWith('.bat') || f.endsWith('.cmd'));
            const hasAddonXml = lowerFiles.includes('addon.xml') || keyDirectories.some(d => d.toLowerCase().includes('plugin.') || d.toLowerCase().includes('repo'));
            let typeLabel = 'Projekt-Workspace';
            if (hasAddonXml) {
                typeLabel = 'Kodi Addon / Repository-Projekt';
            }
            else if (hasGameFiles && hasWebFiles) {
                typeLabel = 'Web- & Spiel-Projekt (HTML/JS/CSS)';
            }
            else if (hasGameFiles && hasPython) {
                typeLabel = 'Python-Spiel / Companion-Projekt';
            }
            else if (hasWebFiles) {
                typeLabel = 'Web-Anwendung';
            }
            else if (hasPython) {
                typeLabel = 'Python-Anwendung / Skript-Projekt';
            }
            else if (hasCSharp) {
                typeLabel = 'C# / .NET Desktop- oder App-Projekt';
            }
            else if (hasScripts) {
                typeLabel = 'Automatisierungs- & Skript-Projekt';
            }
            else if (techStack.length > 0 && !techStack.includes('Allgemeines Projekt')) {
                typeLabel = `${techStack.slice(0, 3).join(' / ')}-Projekt`;
            }
            const notableFiles = files.slice(0, 4).join(', ');
            const dirInfo = keyDirectories.length > 0 ? ` Ordner: ${keyDirectories.slice(0, 4).join(', ')}.` : '';
            const fileInfo = notableFiles ? ` Hauptdateien: ${notableFiles}.` : '';
            if (stats.fileCount === 0 && keyDirectories.length === 0) {
                return `Leerer Projektordner „${folderName}“ – bereit für neue Dateien in Antigravity.`;
            }
            return `${typeLabel} (${stats.fileCount} ${stats.fileCount === 1 ? 'Datei' : 'Dateien'}).${fileInfo}${dirInfo}`;
        }
        catch {
            return `Projekt „${folderName}“ (${techStack.join(', ')}) mit ${stats.fileCount} Dateien.`;
        }
    }
    async detectTechStack(rootPath, initialTags) {
        const stackSet = new Set(initialTags);
        const checkFile = (name, tag) => {
            if (fs.existsSync(path.join(rootPath, name))) {
                stackSet.add(tag);
            }
        };
        checkFile('Dockerfile', 'Docker');
        checkFile('docker-compose.yml', 'Docker');
        checkFile('docker-compose.yaml', 'Docker');
        checkFile('CMakeLists.txt', 'C/C++');
        checkFile('Makefile', 'Makefile');
        checkFile('pom.xml', 'Java');
        checkFile('build.gradle', 'Gradle / Java');
        checkFile('composer.json', 'PHP');
        checkFile('Gemfile', 'Ruby');
        checkFile('index.html', 'HTML5');
        checkFile('style.css', 'CSS3');
        checkFile('game.js', 'Game / JS');
        try {
            const topFiles = fs.readdirSync(rootPath);
            for (const file of topFiles) {
                const lower = file.toLowerCase();
                if (lower.endsWith('.cs') || lower.endsWith('.csproj') || lower.endsWith('.sln')) {
                    stackSet.add('C# / .NET');
                }
                if (lower.endsWith('.py'))
                    stackSet.add('Python');
                if (lower.endsWith('.html'))
                    stackSet.add('HTML5');
                if (lower.endsWith('.css'))
                    stackSet.add('CSS3');
                if (lower.endsWith('.js') && !stackSet.has('TypeScript'))
                    stackSet.add('JavaScript');
                if (lower.endsWith('.ts') || lower.endsWith('.tsx'))
                    stackSet.add('TypeScript');
                if (lower.endsWith('.ps1') || lower.endsWith('.bat'))
                    stackSet.add('PowerShell / Batch');
                if (lower.endsWith('.rbxl') || lower.endsWith('.rbxm') || lower.endsWith('.lua'))
                    stackSet.add('Lua / Roblox');
            }
        }
        catch { }
        if (stackSet.size === 0) {
            stackSet.add('Allgemeines Projekt');
        }
        return Array.from(stackSet);
    }
    async getStats(rootPath, ignoredSet) {
        let fileCount = 0;
        let dirCount = 0;
        const maxFiles = 10000;
        const countRecursive = (dir, depth) => {
            if (depth > 6 || fileCount >= maxFiles)
                return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (ignoredSet.has(entry.name.toLowerCase()))
                        continue;
                    if (entry.name.startsWith('.') && entry.name !== '.vscode')
                        continue;
                    if (entry.isDirectory()) {
                        dirCount++;
                        countRecursive(path.join(dir, entry.name), depth + 1);
                    }
                    else if (entry.isFile()) {
                        fileCount++;
                    }
                }
            }
            catch { }
        };
        countRecursive(rootPath, 0);
        const gitInfo = await this.getGitInfo(rootPath);
        return {
            fileCount,
            dirCount,
            gitBranch: gitInfo.branch,
            lastCommit: gitInfo.lastCommit,
            lastCommitDate: gitInfo.lastCommitDate
        };
    }
    async getGitInfo(rootPath) {
        const gitDir = path.join(rootPath, '.git');
        if (!fs.existsSync(gitDir)) {
            return {};
        }
        const cliResult = await new Promise((resolve) => {
            (0, child_process_1.execFile)('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: rootPath, timeout: 1500 }, (err, stdout) => {
                if (err || !stdout.trim()) {
                    resolve({});
                    return;
                }
                const branch = stdout.trim();
                (0, child_process_1.execFile)('git', ['log', '-1', '--pretty=format:%h|%s|%cr'], { cwd: rootPath, timeout: 1500 }, (logErr, logStdout) => {
                    if (logErr || !logStdout.trim()) {
                        resolve({ branch });
                        return;
                    }
                    const [hash, msg, relDate] = logStdout.trim().split('|');
                    resolve({
                        branch,
                        lastCommit: `${hash}: ${msg}`,
                        lastCommitDate: relDate
                    });
                });
            });
        });
        if (cliResult.branch) {
            return cliResult;
        }
        try {
            const headPath = path.join(gitDir, 'HEAD');
            if (fs.existsSync(headPath)) {
                const headContent = fs.readFileSync(headPath, 'utf8').trim();
                let branch = headContent;
                if (headContent.startsWith('ref: refs/heads/')) {
                    branch = headContent.replace('ref: refs/heads/', '');
                    const branchRefPath = path.join(gitDir, 'refs', 'heads', branch);
                    if (fs.existsSync(branchRefPath)) {
                        const commitHash = fs.readFileSync(branchRefPath, 'utf8').trim().substring(0, 7);
                        return {
                            branch,
                            lastCommit: `Commit ${commitHash}`,
                            lastCommitDate: 'Aktuell'
                        };
                    }
                }
                return { branch };
            }
        }
        catch { }
        return {};
    }
    evaluateHealth(rootPath, hasReadme, stats, techStack) {
        const details = [];
        let isWarning = false;
        if (hasReadme) {
            details.push('✓ README-Dokumentation vorhanden');
        }
        else {
            details.push('ℹ Keine README.md vorhanden (Beschreibung automatisch erkannt)');
        }
        if (stats.gitBranch) {
            details.push(`✓ Git-Repository aktiv (Branch: ${stats.gitBranch})`);
        }
        else {
            details.push('ℹ Kein Git-Repository eingerichtet');
        }
        if (techStack.includes('Node.js')) {
            const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'];
            const hasLock = lockFiles.some(f => fs.existsSync(path.join(rootPath, f)));
            if (hasLock) {
                details.push('✓ Paket-Lockdatei vorhanden');
            }
            else {
                details.push('⚠ Keine Lockdatei (z. B. package-lock.json) gefunden');
                isWarning = true;
            }
        }
        if (stats.fileCount > 0) {
            details.push(`✓ ${stats.fileCount.toLocaleString('de-DE')} Projektdateien erkannt`);
        }
        if (isWarning) {
            return {
                status: 'warning',
                badge: '⚡ Hinweis',
                message: 'Einige empfohlene Projektdateien fehlen.',
                details
            };
        }
        return {
            status: 'healthy',
            badge: '✓ Bereit',
            message: 'Projekt ist sauber strukturiert und bereit für Antigravity.',
            details
        };
    }
    async getKeyDirectories(rootPath, ignoredSet) {
        try {
            const entries = fs.readdirSync(rootPath, { withFileTypes: true });
            const dirs = [];
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                const name = entry.name;
                if (ignoredSet.has(name.toLowerCase()))
                    continue;
                if (name.startsWith('.'))
                    continue;
                dirs.push(name);
            }
            return dirs.slice(0, 15);
        }
        catch {
            return [];
        }
    }
    async loadPersistedDataByPath(rootPath) {
        const registry = this.getSavedRegistry();
        const key = this.normalizePathKey(rootPath);
        const regEntry = registry[key] || {};
        const configPath = path.join(rootPath, '.vscode', 'project-summary.json');
        if (fs.existsSync(configPath)) {
            try {
                const raw = fs.readFileSync(configPath, 'utf8');
                const parsed = JSON.parse(raw);
                return {
                    customName: parsed.customName ?? regEntry.customName,
                    customDescription: parsed.customDescription ?? regEntry.customDescription,
                    notes: parsed.notes ?? regEntry.notes ?? '',
                    tags: Array.isArray(parsed.tags) ? parsed.tags : (regEntry.tags || []),
                    isFavorite: parsed.isFavorite !== undefined ? !!parsed.isFavorite : (regEntry.isFavorite !== undefined ? !!regEntry.isFavorite : false),
                    lastOpened: regEntry.lastOpened
                };
            }
            catch { }
        }
        return {
            customName: regEntry.customName,
            customDescription: regEntry.customDescription,
            notes: regEntry.notes || '',
            tags: regEntry.tags || [],
            isFavorite: !!regEntry.isFavorite,
            lastOpened: regEntry.lastOpened
        };
    }
    async savePersistedData(idOrUriStr, data) {
        let rootPath = idOrUriStr;
        if (idOrUriStr.startsWith('file://')) {
            rootPath = vscode.Uri.parse(idOrUriStr).fsPath;
        }
        if (!rootPath || !fs.existsSync(rootPath))
            return;
        const current = await this.loadPersistedDataByPath(rootPath);
        const updated = {
            customName: data.customName !== undefined ? data.customName : current.customName,
            customDescription: data.customDescription !== undefined ? data.customDescription : current.customDescription,
            notes: data.notes !== undefined ? data.notes : current.notes,
            tags: data.tags !== undefined ? data.tags : current.tags,
            isFavorite: data.isFavorite !== undefined ? data.isFavorite : current.isFavorite
        };
        // 1. In globaler Registry speichern
        const registry = this.getSavedRegistry();
        const key = this.normalizePathKey(rootPath);
        registry[key] = {
            ...(registry[key] || {
                folderPath: rootPath,
                folderUri: vscode.Uri.file(rootPath).toString(),
                addedAt: Date.now()
            }),
            customName: updated.customName,
            customDescription: updated.customDescription,
            notes: updated.notes,
            tags: updated.tags,
            isFavorite: updated.isFavorite
        };
        this.saveRegistry(registry);
        // 2. In Antigravity-Projektkonfiguration Namen aktualisieren
        const effectiveName = (updated.customName && updated.customName.trim())
            ? updated.customName.trim()
            : path.basename(rootPath);
        this.ensureAntigravityProjectRegistered(rootPath, effectiveName);
        // 3. In .vscode/project-summary.json im Projektordner speichern
        try {
            const vscodeDir = path.join(rootPath, '.vscode');
            if (!fs.existsSync(vscodeDir)) {
                fs.mkdirSync(vscodeDir, { recursive: true });
            }
            const configPath = path.join(vscodeDir, 'project-summary.json');
            fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');
        }
        catch (e) {
            console.warn('Konnte .vscode/project-summary.json nicht schreiben:', e);
        }
    }
    getFallbackMetadata(rootPath, isActiveWorkspace) {
        const folderName = path.basename(rootPath);
        const folderUri = vscode.Uri.file(rootPath).toString();
        return {
            id: folderUri,
            name: folderName,
            folderName,
            folderUri,
            folderPath: rootPath,
            description: `Projektordner „${folderName}“`,
            autoDescription: `Projektordner „${folderName}“`,
            isActiveWorkspace,
            isFavorite: false,
            techStack: ['Ordner'],
            stats: { fileCount: 0, dirCount: 0 },
            hasReadme: false,
            customNotes: '',
            customTags: [],
            health: {
                status: 'info',
                badge: 'ℹ Bereit',
                message: 'Ordner erkannt.',
                details: []
            },
            keyDirectories: []
        };
    }
}
exports.ProjectScanner = ProjectScanner;
//# sourceMappingURL=projectScanner.js.map