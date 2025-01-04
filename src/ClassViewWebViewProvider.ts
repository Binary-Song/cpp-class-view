import { TranslationUnitModel } from "./TranslationUnitModel";
import * as vscode from 'vscode';
import * as vsce from './vscode-elements';

export class ClassViewWebViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    private constructor(
        private readonly context: vscode.ExtensionContext,
        private _model: TranslationUnitModel,
        private htmlFileContent: string,
        private cssFileContent: string,
        private uri_replacements: Map<string, vscode.Uri>,
        private codiconDir: vscode.Uri) {
    }

    static async create(context: vscode.ExtensionContext,
        _model: TranslationUnitModel) {
        let htmlFileContent = await ClassViewWebViewProvider.readMediaFile('index.html', context);
        const node_modules = vscode.Uri.joinPath(context.extensionUri, 'node_modules');
        const html_replacements = new Map([
            ["vscode_elements_bundled_uri", vscode.Uri.joinPath(node_modules, '@vscode-elements/elements/dist/bundled.js')],
            ["codicon_css_path", vscode.Uri.joinPath(node_modules, '@vscode/codicons/dist/codicon.css')],
        ]);
        const codiconDir = vscode.Uri.joinPath(node_modules, '@vscode/codicons/src/icons');
        const cssFileContent = await ClassViewWebViewProvider.readMediaFile('style.css', context);
        return new ClassViewWebViewProvider(context, _model, htmlFileContent, cssFileContent, html_replacements, codiconDir);
    }

    async resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;
        await this.update();
    }

    public get model() {
        return this._model;
    }

    public async setModel(value: TranslationUnitModel) {
        this._model = value;
        await this.update();
    }

    private makeIcons(value: string): vsce.TreeItemIconConfig {
        const path = `${this.codiconDir}/${value}.svg`;
        return { branch: value, leaf: value, open: value };
    }

    private getTreeData(webview: vscode.Webview): vsce.TreeItem[] {
        let items: vsce.TreeItem[] = [];
        if (this.model.type === "err") {
            items.push({
                label: '${this.model.err}',
                icons: this.makeIcons("error"),
            });
        } else {
            for (const cls of this.model.classes) {
                let memberItems : vsce.TreeItem[] = [];
                for (const field of cls.fields) {
                    memberItems.push({
                        label: field.name,
                        icons: this.makeIcons("symbol-field"),
                    });
                }
                for (const method of cls.methods) {
                    memberItems.push({
                        label: method.name,
                        icons: this.makeIcons("symbol-method"),
                    });
                }
                items.push({
                    label: cls.fullName,
                    icons: this.makeIcons("symbol-class"),
                    subItems: memberItems
                });
            }
        }
        return items;
    }

    private static async readMediaFile(file: string, context: vscode.ExtensionContext): Promise<string> {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'src', 'media', file));
        const str = Buffer.from(bytes).toString('utf8');
        return str;
    }

    public update() {
        if (this.view) {
            const webview = this.view.webview;
            webview.options = {
                enableScripts: true
            };
            let content = this.htmlFileContent;
            for (const [key, value] of this.uri_replacements) {
                content = content.replaceAll(`{{${key}}}`, webview.asWebviewUri(value).toString());
            }
            webview.html = content;
            webview.postMessage({
                command: 'update_data',
                target: "main-tree",
                data: this.getTreeData(webview)
            });
        }
    }
}