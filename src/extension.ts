import * as vscode from "vscode";
import { CScoutViewProvider } from "./providers/CScoutViewProvider";
import { fetchIdentifierLocations, IdentifierFilters } from "./services/IdentifierApi";
import { FILE_FILTERS, FileItem } from "./services/fileApi";
import { FileProvider } from "./providers/filleProvider";
import { DependencyProvider } from "./providers/depdencyProvider";
import { FunctionProvider } from "./providers/funcSectionProvider";
import { FUNCTION_FILTERS } from "./services/FunSectionapi";
export let currentIdentifierFilters: IdentifierFilters = {};
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
        const type = node.depType; // C / F / G
        const dir = node.dir;      // D / U

        const gtype = mapGraphType(type);
        const n = dir;

        const url = `http://localhost:8081/fgraph.svg?gtype=${gtype}&f=${fid}&n=${n}&filter=${filter}`;


        vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(url));
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

            const panel = vscode.window.createWebviewPanel(
                "cscoutGraph",
                `Graph: ${node.name}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true
                }
            );

            panel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #1e1e1e;
        }

        #container {
            width: 100vw;
            height: 100vh;
            cursor: grab;
            overflow: hidden;
        }

        #container:active {
            cursor: grabbing;
        }

        object {
            width: 100%;
            height: 100%;
            pointer-events: none; /* allow drag */
        }
    </style>
</head>
<body>

<div id="container">
    <object id="svgObj" data="${url}" type="image/svg+xml"></object>
</div>

<script>
    const container = document.getElementById('container');

    let scale = 1;
    let pos = { x: 0, y: 0 };
    let isDragging = false;
    let start = { x: 0, y: 0 };

    container.addEventListener('wheel', (e) => {
        e.preventDefault();

        const zoomFactor = 0.1;
        const direction = e.deltaY > 0 ? -1 : 1;

        scale += direction * zoomFactor;
        scale = Math.max(0.2, Math.min(scale, 5));

        updateTransform();
    });

    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        start.x = e.clientX - pos.x;
        start.y = e.clientY - pos.y;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        pos.x = e.clientX - start.x;
        pos.y = e.clientY - start.y;

        updateTransform();
    });

    function updateTransform() {
        container.style.transform =
            \`translate(\${pos.x}px, \${pos.y}px) scale(\${scale})\`;
    }
</script>

</body>
</html>
`;
        })
    );

}

export function deactivate() {
    console.log("[CScout] Extension deactivated");
}