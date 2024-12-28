import * as vscode from 'vscode';

export interface ExtensionInterface {
    showOutputPanel(): void;
    writeOutput(text: string): void;
    get context(): vscode.ExtensionContext;
}