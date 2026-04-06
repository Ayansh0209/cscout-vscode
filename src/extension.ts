import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CScoutViewProvider } from "./providers/CScoutViewProvider";
import { fetchIdentifierLocations, IdentifierFilters } from "./services/IdentifierApi";
import { FILE_FILTERS, FileItem } from "./services/fileApi";
import { FileProvider } from "./providers/filleProvider";
import { DependencyProvider } from "./providers/depdencyProvider";
import { FunctionProvider } from "./providers/funcSectionProvider";
import { FUNCTION_FILTERS } from "./services/FunSectionapi";
import { renderGraph } from "./webview/renderGrpah";
import { CScoutProcess } from "./cscoutProcess";
import { findCscoutHome } from "./cscoutHome";
import {
    choosePipeline,
    scanCFiles,
    scanHFiles,
    detectIncludePaths,
    detectProjects,
    hasMakefile,
} from "./projectDetector";
import { generateProcessingScript, WorkspaceConfig } from "./scriptGenerator";

export let currentIdentifierFilters: IdentifierFilters = {};

// Global CScout process manager — shared across commands
let cscoutProcess: CScoutProcess | null = null;
// Path to the last generated .cs file
let lastCsPath: string | null = null;

export function activate(context: vscode.ExtensionContext) {

    console.log("[CScout] Extension activated");
    type FunctionFilterKey = keyof typeof FUNCTION_FILTERS;

    const filesProvider = new FileProvider();
    const identifiersProvider = new CScoutViewProvider();
    const depProvider = new DependencyProvider();
    const functionProvider = new FunctionProvider();
    vscode.window.registerTreeDataProvider(
        "cscoutDependenciesView",
        depProvider
    );


    vscode.window.registerTreeDataProvider("cscoutFilesView", filesProvider);
    vscode.window.registerTreeDataProvider("cscoutIdentifiersView", identifiersProvider);

    console.log("[CScout] Views registered");


    // IDENTIFIER FILTER 
    // IDENTIFIER FILTER 
    let identifierFilterState: (keyof IdentifierFilters)[] = [];

    const identifierFilterCommand = vscode.commands.registerCommand(
        "cscout.openFilter",
        async () => {

            console.log("[CScout] Identifier filter opened");

            const options = [
                { label: "Readonly", key: "readonly" },
                { label: "Unused", key: "unused" },
                { label: "Macro", key: "macro" },
                { label: "Function", key: "function" },
                { label: "Variable", key: "variable" },
                { label: "Struct", key: "struct" },
                { label: "Typedef", key: "typedef" }
            ];

            const selected = await vscode.window.showQuickPick(
                options.map(opt => ({
                    ...opt,
                    picked: identifierFilterState.includes(opt.key as keyof IdentifierFilters)
                })),
                {
                    canPickMany: true,
                    placeHolder: "Select identifier filters"
                }
            );

            if (!selected) return;

            // SAVE STATE
            identifierFilterState = selected.map(s => s.key as keyof IdentifierFilters);

            const filters: IdentifierFilters = {};

            identifierFilterState.forEach(key => {
                filters[key] = true;
            });

            // SAVE GLOBALLY
            currentIdentifierFilters = filters;

            console.log("[CScout] Identifier filters applied:", filters);

            identifiersProvider.refresh();
        }
    );
    context.subscriptions.push(identifierFilterCommand);


    vscode.commands.registerCommand("cscout.openFileFilter", async () => {
        console.log("[CScout] File filter opened");

        const filterOptions = [
            { label: "All Files", key: "ALL_FILES", value: FILE_FILTERS.ALL_FILES },
            { label: "Read-only Files", key: "READ_ONLY", value: FILE_FILTERS.READ_ONLY },
            { label: "Writable Files", key: "WRITABLE", value: FILE_FILTERS.WRITABLE },

            { label: "Writable .c files without any statements", key: "NO_STATEMENTS", value: FILE_FILTERS.NO_STATEMENTS },
            { label: "Writable files containing unprocessed lines", key: "UNPROCESSED_LINES", value: FILE_FILTERS.UNPROCESSED_LINES },
            { label: "Writable files containing strings", key: "CONTAINS_STRINGS", value: FILE_FILTERS.CONTAINS_STRINGS },
            { label: "Writable .h files with #include directives", key: "HEADER_WITH_INCLUDES", value: FILE_FILTERS.HEADER_WITH_INCLUDES },
        ];

        const current = filesProvider.getActiveFilters();

        const selected = await vscode.window.showQuickPick(
            filterOptions.map(opt => ({
                ...opt,
                picked: current.includes(opt.key)
            })),
            {
                canPickMany: true,
                placeHolder: "Select file filters"
            }
        );

        if (!selected) return;

        const selectedKeys = selected.map(s => s.key);

        console.log("[CScout] Selected filters:", selectedKeys);

        filesProvider.setMultipleFilters(selectedKeys);
    });


    context.subscriptions.push(
        vscode.commands.registerCommand("cscout.focusDependencies", (file: FileItem) => {
            depProvider.setFocus(file);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("cscout.resetDependencies", () => {
            depProvider.setFocus(null);
        })
    );
    function openGraph(node: any, filter: "writable" | "all") {

        if (!node?.file?.id) return;

        const fid = node.file.id;
        const type = node.depType;
        const dir = node.dir;

        const gtype = mapGraphType(type);
        const n = dir;

        const url = `http://localhost:8081/fgraph.svg?gtype=${gtype}&f=${fid}&n=${n}&filter=${filter}`;

        renderGraph(url, `Dependency Graph`);
    }
    function mapGraphType(type: string): string {

        if (type === "C") return "F"; // compile
        if (type === "F") return "F"; // calls
        if (type === "G") return "G"; // data

        return "F";
    }
    vscode.commands.registerCommand("cscout.openGraphDefault", (node) => {
        openGraph(node, depProvider.getFilter());
    });

    vscode.commands.registerCommand("cscout.openGraphWritable", () => {
        depProvider.setFilter("writable");
    });

    vscode.commands.registerCommand("cscout.openGraphAll", () => {
        depProvider.setFilter("all");
    });
    vscode.commands.registerCommand("cscout.refreshDependencies", () => {
        depProvider.refresh();
    });

    vscode.window.registerTreeDataProvider(
        "cscoutFunctionsView",
        functionProvider
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("cscout.noOp", () => { })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("cscout.openFunctionFilter", async () => {

            console.log("[CScout] Function filter opened");

            const filterOptions: { label: string; key: FunctionFilterKey }[] = [
                { label: "All Functions", key: "ALL_FUNCTIONS" },
                { label: "Project-scoped Writable", key: "PROJECT_WRITABLE" },
                { label: "File-scoped Writable", key: "FILE_WRITABLE" },
                { label: "Writable Not Called", key: "WRITABLE_NOT_CALLED" },
                { label: "Writable Called Once", key: "WRITABLE_CALLED_ONCE" },
            ];

            const current = functionProvider.getActiveFilters() as FunctionFilterKey[];

            const selected = await vscode.window.showQuickPick(
                filterOptions.map(opt => ({
                    ...opt,
                    picked: current.includes(opt.key as FunctionFilterKey)
                })),
                {
                    canPickMany: true,
                    placeHolder: "Select function filters"
                }
            );

            if (!selected) return;

            const selectedKeys = selected.map(s => s.key as FunctionFilterKey);

            console.log("[CScout] Selected function filters:", selectedKeys);

            functionProvider.setMultipleFilters(selectedKeys);
        })

    );

    function fromWSLPath(p: string): string {
        if (p.startsWith("/mnt/")) {
            const drive = p[5].toUpperCase();
            return drive + ":" + p.slice(6).replace(/\//g, "\\");
        }
        return p;
    }


    async function openFileAtLocation(filePath: string, line: number) {
        const uri = vscode.Uri.file(filePath);

        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);

        const position = new vscode.Position(line - 1, 0);

        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    }
    context.subscriptions.push(

        vscode.commands.registerCommand('cscout.openLocation', async (file, line) => {
            const fixed = fromWSLPath(file);
            await openFileAtLocation(fixed, line || 1);
        }),

        vscode.commands.registerCommand('cscout.openFile', async (file) => {
            const fixed = fromWSLPath(file);
            await openFileAtLocation(fixed, 1);
        }),

        vscode.commands.registerCommand('cscout.openFunction', async (file, line) => {

            if (!file) return;

            try {
                const fixed = fromWSLPath(file);
                await openFileAtLocation(fixed, line || 1);

            } catch (err) {
                console.error("Function navigation failed:", err);
                vscode.window.showErrorMessage("Failed to open function");
            }
        })

    );

    context.subscriptions.push(
        vscode.commands.registerCommand("cscout.openFunctionGraph", (node) => {
            if (!node || !node.id) return;

            const url = `http://localhost:8081/cgraph.svg?all=1&f=${node.id}&n=B`;

            renderGraph(url, `Graph: ${node.name}`);
        })
    );

    // -----------------------------------------------------------------
    // New commands: Project initialization and CScout management
    // -----------------------------------------------------------------

    // --- Initialize ---
    context.subscriptions.push(
        vscode.commands.registerCommand("cscout.initialize", async () => {
            await initializeCScout(context);
        })
    );

    // --- Re-analyze ---
    context.subscriptions.push(
        vscode.commands.registerCommand("cscout.reanalyze", async () => {
            if (cscoutProcess?.isRunning()) {
                cscoutProcess.stop();
            }
            await initializeCScout(context);
        })
    );

    // --- Stop ---
    context.subscriptions.push(
        vscode.commands.registerCommand("cscout.stop", () => {
            if (cscoutProcess?.isRunning()) {
                cscoutProcess.stop();
                vscode.window.showInformationMessage("CScout server stopped.");
            } else {
                vscode.window.showInformationMessage("CScout is not running.");
            }
        })
    );

    // --- Show Script ---
    context.subscriptions.push(
        vscode.commands.registerCommand("cscout.showScript", async () => {
            if (lastCsPath && fs.existsSync(lastCsPath)) {
                const doc = await vscode.workspace.openTextDocument(lastCsPath);
                await vscode.window.showTextDocument(doc);
            } else {
                vscode.window.showWarningMessage(
                    "No processing script generated yet. Run 'CScout: Initialize Project' first."
                );
            }
        })
    );

    // --- Open Web UI ---
    context.subscriptions.push(
        vscode.commands.registerCommand("cscout.openWeb", () => {
            const port = cscoutProcess?.getPort() ?? 8081;
            vscode.env.openExternal(
                vscode.Uri.parse(`http://localhost:${port}`)
            );
        })
    );

}

// ---------------------------------------------------------------------------
// Core initialization logic
// ---------------------------------------------------------------------------

async function initializeCScout(
    context: vscode.ExtensionContext
): Promise<void> {
    const workspaceRoot =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        vscode.window.showErrorMessage(
            "No workspace folder open. Open a folder containing C code first."
        );
        return;
    }

    // 1. Find CScout configuration
    const cscoutHome = findCscoutHome(workspaceRoot);
    if (!cscoutHome) {
        vscode.window.showErrorMessage(
            "CScout headers not found (host-defs.h / host-incs.h). " +
                "Set CSCOUT_HOME environment variable or create a .cscout directory in your project."
        );
        return;
    }

    // 2. Choose pipeline
    const pipeline = await choosePipeline(workspaceRoot);
    let csPath: string;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "CScout",
            cancellable: false,
        },
        async (progress) => {
            if (pipeline === "csmake") {
                // --- csmake pipeline ---
                progress.report({ message: "Running csmake..." });
                try {
                    const { execSync } = await import("child_process");
                    execSync("make clean", {
                        cwd: workspaceRoot,
                        stdio: "ignore",
                    });
                } catch {
                    // make clean might fail if there's no clean target — that's OK
                }
                try {
                    const { execSync } = await import("child_process");
                    execSync("csmake", {
                        cwd: workspaceRoot,
                        timeout: 5 * 60 * 1000,
                    });
                    csPath = path.join(workspaceRoot, "make.cs");
                    if (!fs.existsSync(csPath)) {
                        throw new Error(
                            "csmake did not generate make.cs"
                        );
                    }
                } catch (err: any) {
                    vscode.window.showWarningMessage(
                        `csmake failed: ${err.message}. Falling back to TypeScript generator.`
                    );
                    csPath = await generateCsFile(
                        workspaceRoot,
                        cscoutHome
                    );
                }
            } else {
                // --- TypeScript generator pipeline ---
                progress.report({
                    message: "Scanning for C files...",
                });
                csPath = await generateCsFile(
                    workspaceRoot,
                    cscoutHome
                );
            }

            lastCsPath = csPath;

            // 3. Start CScout
            progress.report({ message: "Starting CScout..." });

            if (!cscoutProcess) {
                cscoutProcess = new CScoutProcess();
            } else if (cscoutProcess.isRunning()) {
                cscoutProcess.stop();
            }

            try {
                await cscoutProcess.start(csPath, workspaceRoot);
                vscode.window.showInformationMessage(
                    `CScout is ready on port ${cscoutProcess.getPort()}!`
                );
            } catch (err: any) {
                vscode.window.showErrorMessage(
                    `CScout failed to start: ${err.message}`
                );
            }
        }
    );
}

/**
 * Generate a .cs processing script using the TypeScript generator.
 */
async function generateCsFile(
    workspaceRoot: string,
    cscoutHome: string
): Promise<string> {
    const cFiles = scanCFiles(workspaceRoot);
    if (cFiles.length === 0) {
        throw new Error(
            "No C source files found in this workspace. Open a folder containing C code."
        );
    }

    const hFiles = scanHFiles(workspaceRoot);
    const ipaths = detectIncludePaths(workspaceRoot, hFiles);
    const projects = detectProjects(workspaceRoot, cFiles);

    const config: WorkspaceConfig = {
        name: path.basename(workspaceRoot),
        dir: workspaceRoot,
        roPrefix: ["/usr/include"],
        cscoutHome,
        projects: projects.map((p) => ({
            name: p.name,
            dir: p.dir,
            ipaths,
            defines: {},
            files: p.files.map((f) => ({ path: f })),
        })),
    };

    const csContent = generateProcessingScript(config);

    // Write to .cscout-vscode/project.cs
    const outDir = path.join(workspaceRoot, ".cscout-vscode");
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    const csPath = path.join(outDir, "project.cs");
    fs.writeFileSync(csPath, csContent, "utf-8");

    return csPath;
}

export function deactivate() {
    console.log("[CScout] Extension deactivated");
    if (cscoutProcess) {
        cscoutProcess.dispose();
        cscoutProcess = null;
    }
}