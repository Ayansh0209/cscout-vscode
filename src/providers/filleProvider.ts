import * as vscode from "vscode";
import { fetchFiles, FileItem, FILE_FILTERS, fetchFileFunctions, fetchFileIncludes } from "../services/fileApi";
import path from "path/win32";

export class FileProvider implements vscode.TreeDataProvider<FileNode> {
    private activeFilters: string[] = ["ALL_FILES"];
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileNode): vscode.TreeItem {
        return element;
    }
    getActiveFilters(): string[] {
        return this.activeFilters;
    }

    setMultipleFilters(filters: string[]) {
        this.activeFilters = filters;
        this.refresh();
    }
    async getChildren(element?: FileNode): Promise<FileNode[]> {


        if (!element) {
            const activeKey = this.activeFilters[0] || "ALL_FILES";
            const params = FILE_FILTERS[activeKey as keyof typeof FILE_FILTERS];

            const files = await fetchFiles(params);

            return files.map(file =>
                new FileNode(
                    file.path.split("/").pop() || file.path,
                    "file",
                    undefined,
                    file
                )
            );
        }

        // if (element.type === "filter") {
        //     const files = await fetchFiles(element.query!);

        //     return files.map(file => {
        //         const node = new FileNode(file.path.split("/").pop() || file.path, "file", undefined, file);

        //         return node;
        //     });
        // }
        //  
        if (element.type === "file") {
            return [
                new FileNode("Metrics", "metrics", undefined, element.file),
                new FileNode("Functions", "functions", undefined, element.file),
                new FileNode("Includes", "includes", undefined, element.file),
                new FileNode("Dependencies", "dependencies", undefined, element.file),
            ];
        }

        if (element.type === "metrics" && element.file) {

            const f = element.file;

            return [
                new FileNode(`Lines: ${f.lines}`, "leaf"),
                new FileNode(`Tokens: ${f.tokens}`, "leaf"),
                new FileNode(`CPP Directives: ${f.cppDirectives}`, "leaf"),
                new FileNode(`Functions: ${f.functions}`, "leaf"),
                new FileNode(`Variables: ${f.variables}`, "leaf"),
                new FileNode(`Includes: ${f.includes}`, "leaf"),


                new FileNode(`Statements: ${f.statements ?? "N/A"}`, "leaf"),
                new FileNode(`If Statements: ${f.ifCount ?? "N/A"}`, "leaf"),
                new FileNode(`Loops: ${f.loopCount ?? "N/A"}`, "leaf"),
            ];
        }
        //  FUNCTIONS LAYER
        if (element.type === "functions" && element.file) {
            const fid = element.file.id;

            const functions = await fetchFileFunctions(fid);

            return functions.map(fn => {
                const node = new FileNode(
                    fn.function + "()",
                    "functionItem",
                    { line: fn.line },
                    {
                        ...element.file!,
                        path: fn.file
                    }
                );

                node.description = fn.scope === "project" ? "proj" : "file";


                node.tooltip =
                    fn.scope === "project"
                        ? "Project-scoped (global) function — accessible across multiple files"
                        : "File-scoped (static) function — limited to this file only";

                node.iconPath = new vscode.ThemeIcon("symbol-function");

                return node;
            });
        }

        // INCLUDES → FILES (covers all non-graph options)
        if (element.type === "includes" && element.file) {
            const fid = element.file.id;

            const includes = await fetchFileIncludes(fid);
            includes.sort((a, b) => a.file.localeCompare(b.file));
            return includes.map(inc => {
                const name = inc.file.split("/").pop() || inc.file;

                const node = new FileNode(
                    name,
                    "includeItem",
                    { path: inc.file },
                    element.file
                );

                // compact tag rendering
                node.description = inc.tags.join(" ");


                node.tooltip =
                    `${inc.file}\n` +
                    (inc.direct ? "Direct include\n" : "Indirect include\n") +
                    (inc.writable ? "Writable file\n" : "Read-only file\n") +
                    (inc.unused ? "Unused include\n" : "Used/required include\n");

                node.iconPath = new vscode.ThemeIcon("file");

                return node;
            });
        }

        return [];
    }
}

class FileNode extends vscode.TreeItem {

    constructor(
        public label: string,
        public type: "root" | "filter" | "file" | "metrics" | "functions" | "functionItem" | "includes" | "includeItem" | "dependencies" | "leaf",
        public query?: Record<string, any>,
        public file?: FileItem
    ) {
        super(
            label,
            type === "leaf"
                ? vscode.TreeItemCollapsibleState.None
                : vscode.TreeItemCollapsibleState.Collapsed
        );

        if (type === "filter") {
            this.iconPath = new vscode.ThemeIcon("folder");
        }

        if (type === "file" && file) {
            this.description = `${file.lines} lines`;
            this.tooltip = file.path;
            this.iconPath = new vscode.ThemeIcon("file-code");
        }
        if (type === "metrics") {
            this.iconPath = new vscode.ThemeIcon("graph");
        }

        if (type === "functions") {
            this.iconPath = new vscode.ThemeIcon("symbol-method");
        }

        if (type === "includes") {
            this.iconPath = new vscode.ThemeIcon("link");
        }

        if (type === "dependencies" && file) {
            this.command = {
                command: "cscout.focusDependencies",
                title: "Show Dependencies",
                arguments: [file]
            };

            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }
        if (type === "functionItem" && file) {
            const line = this.query?.line ?? 1;

            this.command = {
                command: "vscode.open",
                arguments: [
                    vscode.Uri.file(file.path),
                    {
                        selection: new vscode.Range(
                            new vscode.Position(line - 1, 0),
                            new vscode.Position(line - 1, 0)
                        )
                    }
                ],
                title: "Open Function"
            };
        }
        if (type === "includeItem" && file && query?.path) {
            this.iconPath = new vscode.ThemeIcon("file-submodule");

            this.command = {
                command: "vscode.open",
                title: "Open Include File",
                arguments: [vscode.Uri.file(query.path)]
            };
        }
    }
}