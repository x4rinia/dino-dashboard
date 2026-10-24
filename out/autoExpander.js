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
exports.AutoExpander = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class AutoExpander {
    hasAutoExpanded = false;
    /**
     * Klappt automatisch die wichtigsten Projektordner im VS Code / Antigravity Explorer aus.
     */
    async expandWorkspace(settings, force = false) {
        if (!force && this.hasAutoExpanded) {
            return;
        }
        if (!settings.autoExpandExplorer && !force) {
            return;
        }
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return;
        }
        this.hasAutoExpanded = true;
        const ignoredSet = new Set(settings.ignoredFolders.map(f => f.toLowerCase()));
        try {
            await vscode.commands.executeCommand('workbench.view.explorer');
        }
        catch { }
        await new Promise(r => setTimeout(r, 250));
        for (const folder of folders) {
            const rootPath = folder.uri.fsPath;
            try {
                await vscode.commands.executeCommand('revealInExplorer', folder.uri);
                const entries = fs.readdirSync(rootPath, { withFileTypes: true });
                const candidateDirs = [];
                let fallbackFile = null;
                for (const entry of entries) {
                    const name = entry.name;
                    if (name.startsWith('.') || ignoredSet.has(name.toLowerCase())) {
                        continue;
                    }
                    if (entry.isDirectory()) {
                        candidateDirs.push(name);
                    }
                    else if (!fallbackFile && (name.startsWith('README') || name === 'package.json' || name === 'index.html' || name === 'main.py')) {
                        fallbackFile = name;
                    }
                }
                const priorityOrder = ['src', 'lib', 'app', 'components', 'pages', 'pkg', 'core', 'server', 'client', 'assets', 'docs', 'test', 'tests'];
                candidateDirs.sort((a, b) => {
                    const aIndex = priorityOrder.indexOf(a.toLowerCase());
                    const bIndex = priorityOrder.indexOf(b.toLowerCase());
                    if (aIndex !== -1 && bIndex !== -1)
                        return aIndex - bIndex;
                    if (aIndex !== -1)
                        return -1;
                    if (bIndex !== -1)
                        return 1;
                    return a.localeCompare(b);
                });
                const toReveal = candidateDirs.slice(0, 3);
                if (toReveal.length > 0) {
                    for (const dirName of toReveal) {
                        const dirUri = vscode.Uri.file(path.join(rootPath, dirName));
                        try {
                            await vscode.commands.executeCommand('revealInExplorer', dirUri);
                            await new Promise(r => setTimeout(r, 60));
                        }
                        catch { }
                    }
                }
                else if (fallbackFile) {
                    const fileUri = vscode.Uri.file(path.join(rootPath, fallbackFile));
                    await vscode.commands.executeCommand('revealInExplorer', fileUri);
                }
            }
            catch (err) {
                console.warn(`[AutoExpander] Konnte Ordner ${folder.name} nicht ausklappen:`, err);
            }
        }
    }
    reset() {
        this.hasAutoExpanded = false;
    }
}
exports.AutoExpander = AutoExpander;
//# sourceMappingURL=autoExpander.js.map