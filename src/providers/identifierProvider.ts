import * as vscode from 'vscode';
import { Identifier } from '../services/IdentifierApi';

export class IdentifierItem extends vscode.TreeItem {

    constructor(public readonly identifier: Identifier) {

      
        super(identifier.name, vscode.TreeItemCollapsibleState.Collapsed);

       
        this.description = getStatus(identifier);

      
        this.iconPath = new vscode.ThemeIcon(getIcon(identifier));

      
    }
}

/* ---------------- STATUS ---------------- */

function getStatus(id: Identifier): string {
    const status: string[] = [];

    if (id.unused) status.push('⚠');
    if (id.readonly) status.push('🔒');
    if (id.writable) status.push('✏');
    if (id.fileSpanning) status.push('🌍');

    return status.join(' ');
}

/* ---------------- ICONS ---------------- */

function getIcon(id: Identifier): string {

    switch (id.type) {

        case 'function':
            return 'symbol-method';

        case 'variable':
            return 'symbol-variable';

        case 'macro':
            return 'symbol-constant';

        case 'typedef':
            return 'symbol-type-parameter';

        case 'struct':
            return 'symbol-structure';

        case 'struct_member':
            return 'symbol-field';

        default:
            return 'symbol-misc';
    }
}