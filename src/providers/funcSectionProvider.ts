import * as vscode from "vscode";
import {
    fetchFunctions,
    FUNCTION_FILTERS,
    fetchFunctionRelations,
    FunListResponse,
    CallTreeNode
} from "../services/FunSectionapi";

type FilterKey = keyof typeof FUNCTION_FILTERS;
type NodeType = "function" | "callees" | "callers";

interface FunctionNode {
    type: NodeType;
    id: string;
    name: string;
    direction?: "d" | "u";
}

export class FunctionProvider implements vscode.TreeDataProvider<FunctionNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    private activeFilters: FilterKey[] = ["ALL_FUNCTIONS"];

    // Cache: function list only fetched once per filter set
    private cachedFunctions: FunctionNode[] | null = null;

    // Cache: callers/callees per node id+direction  e.g. "0x55a3...-d"
    private relationCache: Map<string, FunctionNode[]> = new Map();

    refresh(): void {
        this.cachedFunctions = null;       // invalidate on explicit refresh
        this.relationCache.clear();
        this._onDidChangeTreeData.fire();
    }

    setMultipleFilters(filterKeys: string[]): void {
        if (!filterKeys || filterKeys.length === 0) {
            this.activeFilters = ["ALL_FUNCTIONS"];
        } else {
            this.activeFilters = filterKeys as FilterKey[];
        }
        this.cachedFunctions = null;       
        this.relationCache.clear();
        this.refresh();
    }

    getActiveFilters(): FilterKey[] {
        return this.activeFilters;
    }

    private buildQueryFromFilters(): Record<string, string | number> {
        const merged: Record<string, string | number> = {};
        for (const key of this.activeFilters) {
            const filter = FUNCTION_FILTERS[key];
            if (!filter) continue;
            for (const param in filter) {
                merged[param] = filter[param as keyof typeof filter] as string | number;
            }
        }
        return merged;
    }

    getTreeItem(element: FunctionNode): vscode.TreeItem {

        if (element.type === "function") {
            const item = new vscode.TreeItem(
                `${element.name}()`,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            item.iconPath = new vscode.ThemeIcon("symbol-function");
            item.id = `fn-${element.id}-${element.name}`;
            item.contextValue = "functionNode";
            item.command = {
                command: "cscout.noOp",
                title: "",
                arguments: []
            };
            return item;
        }

        if (element.type === "callees") {
            const item = new vscode.TreeItem(
                "Callees",
                vscode.TreeItemCollapsibleState.Collapsed
            );
            item.iconPath = new vscode.ThemeIcon("arrow-down");
            item.id = `callees-${element.id}`;
            return item;
        }

        if (element.type === "callers") {
            const item = new vscode.TreeItem(
                "Callers",
                vscode.TreeItemCollapsibleState.Collapsed
            );
            item.iconPath = new vscode.ThemeIcon("arrow-up");
            item.id = `callers-${element.id}`;
            return item;
        }

        return new vscode.TreeItem("");
    }

    async getChildren(element?: FunctionNode): Promise<FunctionNode[]> {

        // ROOT LEVEL — cached after first fetch
        if (!element) {
            if (this.cachedFunctions) return this.cachedFunctions;

            const query = this.buildQueryFromFilters();
            const data = await fetchFunctions(query);
            if (!data || !Array.isArray(data)) return [];

            console.log("[CScout] Sample function from API:", data[0]);

            this.cachedFunctions = data.map((f: any) => ({
                type: "function" as NodeType,
                id: String(f.id ?? f.pointer ?? ""),
                name: f.function
            }));

            return this.cachedFunctions;
        }

        
        if (element.type === "function") {
            return [
                { type: "callees" as NodeType, id: element.id, name: "Callees", direction: "d" },
                { type: "callers" as NodeType, id: element.id, name: "Callers", direction: "u" }
            ];
        }

        // CALLEES / CALLERS — cached per node+direction
        if (element.type === "callees" || element.type === "callers") {
            if (!element.id || element.id === "") {
                console.warn("[CScout] No pointer id — backend missing 'id' field in /api/functions");
                return [];
            }

            const cacheKey = `${element.id}-${element.direction}`;
            if (this.relationCache.has(cacheKey)) {
                return this.relationCache.get(cacheKey)!;
            }

            try {
                const data: FunListResponse | null = await fetchFunctionRelations({
                    f: element.id,
                    n: element.direction!,
                    depth: 1    // one level at a time — VS Code calls getChildren
                                // again on expand, giving infinite lazy nesting
                });

                if (!data || !data.children || data.children.length === 0) {
                    this.relationCache.set(cacheKey, []);
                    return [];
                }

                const children = data.children.map((child: CallTreeNode) => ({
                    type: "function" as NodeType,
                    id: child.id,
                    name: child.name
                }));

                this.relationCache.set(cacheKey, children);
                return children;

            } catch (err) {
                console.error("[CScout] fetchFunctionRelations failed:", err);
                return [];
            }
        }

        return [];
    }
}