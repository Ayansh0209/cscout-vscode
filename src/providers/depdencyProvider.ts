import * as vscode from "vscode";
import { fetchDependencies } from "../services/depedencyApi";
import { fetchFiles, FileItem, FILE_FILTERS } from "../services/fileApi";

export class DependencyProvider implements vscode.TreeDataProvider<DepNode> {

    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private files: FileItem[] = [];
    private filesLoaded = false;          // ← cache flag: don't re-fetch on every expand
    private focusedFile: FileItem | null = null;
    private isFocusedMode = false;
    private currentFilter: "writable" | "all" = "writable";

    refresh() {
        this.filesLoaded = false;         // ← invalidate cache on explicit refresh
        this._onDidChangeTreeData.fire();
    }

    // Only fetches if not already loaded
    private async ensureFilesLoaded() {
        if (this.filesLoaded) return;
        const params = FILE_FILTERS.ALL_FILES;
        this.files = await fetchFiles(params);
        this.filesLoaded = true;
        console.log("DependencyProvider files count:", this.files.length);
    }

    setFilter(filter: "writable" | "all") {
        this.currentFilter = filter;
        this.refresh();
    }

    getFilter() {
        return this.currentFilter;
    }

    setFocus(file: FileItem | null) {
        this.focusedFile = file;
        this.isFocusedMode = !!file;
        this.refresh();
    }

    getTreeItem(element: DepNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DepNode): Promise<DepNode[]> {

        // ROOT → FILES (cached after first load)
        if (!element) {
            await this.ensureFilesLoaded();

            const list = (this.isFocusedMode && this.focusedFile)
                ? [this.focusedFile]
                : this.files;

            return list.map(f =>
                new DepNode(
                    f.path.split("/").pop() || f.path,
                    "file",
                    undefined,
                    undefined,
                    f
                )
            );
        }

        // FILE → GROUPS
        if (element.type === "file") {
            return [
                new DepNode("Compile", "group", "C", undefined, element.file),
                new DepNode("Calls", "group", "F", undefined, element.file),
                new DepNode("Data", "group", "G", undefined, element.file),
            ];
        }

        // GROUP → DIRECTIONS
        if (element.type === "group") {
            return [
                new DepNode("Uses (→)", "root", element.depType, "D", element.file, undefined, "dependencyActionable"),
                new DepNode("Used By (←)", "root", element.depType, "U", element.file, undefined, "dependencyActionable"),
            ];
        }

      
        if (element.type === "root") {
            const fid = element.file?.id;
            if (!fid) return [];

            const data = await fetchDependencies(
                fid,
                element.depType!,
                element.dir!,
                this.currentFilter
            );

            return [
                new DepNode(`Outgoing (${data.outgoing.length})`, "flow", "out", undefined, element.file, data.outgoing),
                new DepNode(`Incoming (${data.incoming.length})`, "flow", "in", undefined, element.file, data.incoming),
                new DepNode(`Bidirectional (${data.bidirectional.length})`, "flow", "bi", undefined, element.file, data.bidirectional),
            ];
        }

        // FLOW → LEAF FILES
        if (element.type === "flow") {
            return (element.flowData || []).map((f: string) =>
                new DepNode(f.split("/").pop() || f, "leaf")
            );
        }

        return [];
    }
}


class DepNode extends vscode.TreeItem {
    constructor(
        public label: string,
        public type: "file" | "group" | "root" | "leaf" | "flow",
        public depType?: any,
        public dir?: any,
        public file?: FileItem,
        public flowData?: string[],
        contextValue?: string
    ) {
        super(
            label,
            type === "leaf"
                ? vscode.TreeItemCollapsibleState.None
                : vscode.TreeItemCollapsibleState.Collapsed
        );

        if (type === "file") this.iconPath = new vscode.ThemeIcon("file");
        if (type === "group") this.iconPath = new vscode.ThemeIcon("symbol-namespace");
        if (type === "root") this.iconPath = new vscode.ThemeIcon("graph");
        if (type === "flow") this.iconPath = new vscode.ThemeIcon("list-tree");
        if (contextValue) this.contextValue = contextValue;
    }
}