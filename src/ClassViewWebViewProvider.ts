import { FieldModel, MemberModel, MethodModel, TranslationUnitModel } from "./TranslationUnitModel";
import * as vscode from 'vscode';
import * as vsce from './vscode-elements';

class Utils {
    static compareArrays(a: string[] | undefined, b: string[] | undefined) {

        a = a ?? [];
        b = b ?? [];

        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const aVal = a[i] ?? "";
            const bVal = b[i] ?? "";
            const comparison = aVal.localeCompare(bVal);
            if (comparison !== 0) {
                return comparison;
            }
        }
        return 0;
    }

    static compareMembers(a: MemberModel, b: MemberModel) {
        const baseCmp = Utils.compareArrays(a.baseChain?.map(base => base.fullName), b.baseChain?.map(base => base.fullName));
        if (baseCmp) {
            return baseCmp;
        }
        const nameCmp = a.name.localeCompare(b.name);
        if (nameCmp) {
            return nameCmp;
        }
        const typeCmp = a.type?.localeCompare(b.type ?? "");
        if (typeCmp) {
            return typeCmp;
        }
        return 0;
    };
}

export class ClassViewProvider implements vscode.WebviewViewProvider {
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
        let htmlFileContent = await ClassViewProvider.readMediaFile('index.html', context);
        const node_modules = vscode.Uri.joinPath(context.extensionUri, 'node_modules');
        const html_replacements = new Map([
            ["vscode_elements_bundled_uri", vscode.Uri.joinPath(node_modules, '@vscode-elements/elements/dist/bundled.js')],
            ["codicon_css_path", vscode.Uri.joinPath(node_modules, '@vscode/codicons/dist/codicon.css')],
        ]);
        const codiconDir = vscode.Uri.joinPath(node_modules, '@vscode/codicons/src/icons');
        const cssFileContent = await ClassViewProvider.readMediaFile('style.css', context);
        return new ClassViewProvider(context, _model, htmlFileContent, cssFileContent, html_replacements, codiconDir);
    }

    async resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;
        this.view.onDidChangeVisibility(async () => { if (this.view?.visible) { this.update(); } });
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

    private getMemberDecor(member: MemberModel): vsce.TreeItemDecoration[] {
        let decor: vsce.TreeItemDecoration[] = [];
        if (member.baseChain && member.baseChain.length > 0) {
            decor.push({ content: "Inh", appearance: 'counter-badge' });
        }
        return decor;
    }

    private getTreeData(webview: vscode.Webview): vsce.TreeItem[] {
        let items: vsce.TreeItem[] = [];
        if (this.model.type === "err") {
            items.push({
                label: `${this.model.err}`,
                icons: this.makeIcons("error"),
            });
        } else {

            for (const cls of this.model.classes) {
                let memberItems: vsce.TreeItem[] = [];

                const fields = cls.fields.sort((a, b) => Utils.compareMembers(a, b));
                for (const field of fields) {
                    memberItems.push({
                        label: field.name,
                        icons: this.makeIcons("symbol-field"),
                        description: ": " + field.extra.type?.qualType,
                        decorations: this.getMemberDecor(field),
                    });
                }

                const methods = cls.methods.sort((a, b) => Utils.compareMembers(a, b));
                for (const method of methods) {
                    let decor: vsce.TreeItemDecoration[] = this.getMemberDecor(method);
                    if (method.extra.pure) {
                        decor.push({ content: "Pur", appearance: 'counter-badge' });
                    }
                    else if (method.extra.virtual) {
                        decor.push({ content: "Vir", appearance: 'counter-badge' });
                    }
                    memberItems.push({
                        label: method.name,
                        icons: this.makeIcons("symbol-method"),
                        description: ": " + method.extra.type?.qualType,
                        decorations: decor
                    });
                }
                items.push({
                    label: cls.fullName,
                    icons: this.makeIcons("symbol-class"),
                    subItems: memberItems,
                    open: true,
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

