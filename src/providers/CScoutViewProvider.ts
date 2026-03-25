import * as vscode from 'vscode';
import {
    fetchIdentifierLocations,
    fetchIdentifiers,
    fetchIdentifierFiles,
    fetchIdentifierFunctions,
    IdentifierFilters
} from '../services/IdentifierApi';
import { currentIdentifierFilters } from '../extension';
import { IdentifierItem } from './identifierProvider';


export class CScoutItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly icon?: vscode.ThemeIcon,
        public readonly parent?: any
    ) {
        super(label, collapsibleState);
        if (icon) this.iconPath = icon;
    }
}

export class CScoutViewProvider implements vscode.TreeDataProvider<any> {


   
    constructor() { }

    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private cache: any[] | null = null;
  

    refresh() {
        this.cache = null;
        
        this._onDidChangeTreeData.fire();
    }


    async getData() {
        if (!this.cache) {
            this.cache = await fetchIdentifiers(currentIdentifierFilters);
        }
        return this.cache;
    }

    
    getTreeItem(element: any): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: any): Promise<any[]> {


        

        if (!element) {
            return [
                new CScoutItem('Functions', vscode.TreeItemCollapsibleState.Collapsed),
                new CScoutItem('Variables', vscode.TreeItemCollapsibleState.Collapsed),
                new CScoutItem('Macros', vscode.TreeItemCollapsibleState.Collapsed),
                new CScoutItem('Typedefs', vscode.TreeItemCollapsibleState.Collapsed),
                new CScoutItem('Struct Tags', vscode.TreeItemCollapsibleState.Collapsed),
                new CScoutItem('Struct Members', vscode.TreeItemCollapsibleState.Collapsed)
            ];
        }


        // CATEGORY LEVEL
        if (isCategory(element.label)) {

            const data = await this.getData();
            const mapped = mapType(element.label);

            const filtered = data.filter(id => {
                if (!id.type) return true;
                return id.type === mapped;
            });

            return filtered.slice(0, 100).map(id => new IdentifierItem(id));
        }

        // IDENTIFIER CLICK
        if ('identifier' in element) {
            return [
                new CScoutItem('Locations', vscode.TreeItemCollapsibleState.Collapsed, new vscode.ThemeIcon('location'), element),
                new CScoutItem('Associated Functions', vscode.TreeItemCollapsibleState.Collapsed, new vscode.ThemeIcon('references'), element),
                new CScoutItem('Dependent Files', vscode.TreeItemCollapsibleState.Collapsed, new vscode.ThemeIcon('files'), element)
            ];
        }

        // LOCATIONS
        if (element.label === 'Locations') {
            const parent = element.parent;

            if (parent && parent.identifier) {
                const data = await fetchIdentifierLocations(parent.identifier.id);

                return data.map(loc => {
                    const item = new CScoutItem(
                        `${loc.file} (line: ${loc.line ?? 'unknown'})`,
                        vscode.TreeItemCollapsibleState.None,
                        new vscode.ThemeIcon('file-code')
                    );

                    item.command = {
                        command: 'cscout.openLocation',
                        title: 'Open Location',
                        arguments: [loc.file, loc.line ?? 1]
                    };

                    return item;
                });
            }

            return [];
        }

        // FUNCTIONS
        if (element.label === 'Associated Functions') {
            const parent = element.parent;

            if (parent && parent.identifier) {
                const data = await fetchIdentifierFunctions(parent.identifier.id);
                console.log("=== ASSOCIATED FUNCTIONS RAW DATA ===");
                console.log(JSON.stringify(data, null, 2));
                return data.map(f => {

                    console.log("Function item:", f);

                    const item = new CScoutItem(
                        f.function || "unknown",
                        vscode.TreeItemCollapsibleState.None,
                        new vscode.ThemeIcon('symbol-method')
                    );


                    if (f.file && f.line !== undefined) {
                        item.command = {
                            command: 'cscout.openFunction',
                            title: 'Open Function',
                            arguments: [f.file, f.line]
                        };
                    } else {
                        console.warn("Invalid function data:", f);
                    }

                    return item;
                });;
            }

            return [];
        }

        // FILES
        if (element.label === 'Dependent Files') {
            const parent = element.parent;

            if (parent && parent.identifier) {
                const data = await fetchIdentifierFiles(parent.identifier.id);

                return data.map(f => {
                    const item = new CScoutItem(
                        f.file,
                        vscode.TreeItemCollapsibleState.None,
                        new vscode.ThemeIcon('file')
                    );

                    item.command = {
                        command: 'cscout.openFile',
                        title: 'Open File',
                        arguments: [f.path || f.file]
                    };

                    console.log("Dependent files:", data);
                    return item;
                });

            }

            return [];
        }


        return [];
    }
}

function mapType(label: string): string {
    switch (label) {
        case 'Functions': return 'function';
        case 'Variables': return 'variable';
        case 'Macros': return 'macro';
        case 'Typedefs': return 'typedef';
        case 'Struct Tags': return 'struct';
        case 'Struct Members': return 'struct_member';
        default: return '';
    }
}

function isCategory(label: string) {
    return [
        'Functions',
        'Variables',
        'Macros',
        'Typedefs',
        'Struct Tags',
        'Struct Members'
    ].includes(label);
}