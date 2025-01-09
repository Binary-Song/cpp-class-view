import { FieldModel, MemberModel, MethodModel, ClassModel, TranslationUnitModel } from "./TranslationUnitModel";
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

interface DetailView {
    get html(): string;
}

class FieldDetailView implements DetailView {

    constructor(private readonly fieldModel: FieldModel) {
    }

    get html(): string {
        return `<h1>Field <code>${this.fieldModel.name}</code></h1>` +
            `<p>Type: <code>${this.fieldModel.extra.type?.qualType}</code></p>`;
    }
}

class MethodDetailView implements DetailView {

    constructor(private readonly methodModel: MethodModel) {
    }

    get html(): string {
        return `<h1>Method <code>${this.methodModel.name}</code></h1>` +
            `<p>Type: <code>${this.methodModel.extra.type?.qualType}</code></p>`;
    }
}

class DetailViews {
    data: DetailView[] = [];

    public add(view: DetailView): string {
        this.data.push(view);
        return (this.data.length - 1).toString();
    }

    public allViews() {
        return this.data;
    }

    public at(key: string) {
        return this.data[parseInt(key)];
    }
}

class SimpleWebViewProvider implements vscode.WebviewViewProvider {
    constructor(private cb: (webviewView: vscode.WebviewView) => Promise<undefined>) {
    }

    async resolveWebviewView(webviewView: vscode.WebviewView) {
        await this.cb(webviewView);
    }
}

export class ClassViewProvider {
    private treeView?: vscode.WebviewView;
    private detailsView?: vscode.WebviewView;
    private detailData?: DetailViews;

    private constructor(
        private readonly context: vscode.ExtensionContext,
        private _model: TranslationUnitModel,
        private treeViewHtml: string,
        private detailsViewHtml: string,
        private uri_replacements: Map<string, vscode.Uri>,
        private codiconDir: vscode.Uri) {
    }

    static async create(context: vscode.ExtensionContext,
        _model: TranslationUnitModel) {
        let treeViewHtml = await ClassViewProvider.readMediaFile('treeView.html', context);
        let detailsViewHtml = await ClassViewProvider.readMediaFile('detailsView.html', context);
        const node_modules = vscode.Uri.joinPath(context.extensionUri, 'node_modules');
        const html_replacements = new Map([
            ["node_modules_dir", node_modules],
        ]);
        const codiconDir = vscode.Uri.joinPath(node_modules, '@vscode/codicons/src/icons');
        return new ClassViewProvider(context, _model, treeViewHtml, detailsViewHtml, html_replacements, codiconDir);
    }

    public getClassViewProvider() {
        return new SimpleWebViewProvider(async (webviewView) => {
            this.treeView = webviewView;
            this.treeView.onDidChangeVisibility(async () => { if (this.treeView?.visible) { this.update(); } });
            this.treeView.webview.onDidReceiveMessage(message => {
                let msg = message as {
                    command: "tree_item_selected",
                    value: string,
                };
                this.detailsView?.webview.postMessage({
                    command: 'set_content',
                    content: this.detailData?.at(msg.value)?.html
                });
            });
        });
    }

    public getDetailsViewProvider() {
        return new SimpleWebViewProvider(async (webviewView) => {
            this.detailsView = webviewView;
            this.detailsView.onDidChangeVisibility(async () => { if (this.detailsView?.visible) { this.update(); } });
        });
    }

    public get model() {
        return this._model;
    }

    public async setModel(value: TranslationUnitModel) {
        this._model = value;
        await this.update();
    }

    private makeIcons(value: string): vsce.TreeItemIconConfig {
        return { branch: value, leaf: value, open: value };
    }

    private getMemberDecor(member: MemberModel): vsce.TreeItemDecoration[] {
        let decor: vsce.TreeItemDecoration[] = [];
        if (member.baseChain && member.baseChain.length > 0) {
            decor.push({ content: "Inh", appearance: 'counter-badge' });
        }
        return decor;
    }

    private getViewData(): { items: vsce.TreeItem[], detailViews: DetailViews } {
        let items: vsce.TreeItem[] = [];
        let detailViews: DetailViews = new DetailViews();
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
                        value: detailViews.add(new FieldDetailView(field))
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
                        decorations: decor,
                        value: detailViews.add(new MethodDetailView(method))
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
        return { items, detailViews };
    }

    private static async readMediaFile(file: string, context: vscode.ExtensionContext): Promise<string> {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'src', 'media', file));
        const str = Buffer.from(bytes).toString('utf8');
        return str;
    }

    public update() {

        let data: [vscode.WebviewView | undefined, string][] = [[this.treeView, this.treeViewHtml], [this.detailsView, this.detailsViewHtml]];
        for (let [view, html] of data) {
            if (!view) {
                return;
            }
            const webview = view.webview;
            webview.options = {
                enableScripts: true
            };
            let content = html;
            for (const [key, value] of this.uri_replacements) {
                content = content.replaceAll(`{{${key}}}`, webview.asWebviewUri(value).toString());
            }
            webview.html = content;
        }

        const viewData = this.getViewData();
        this.treeView?.webview.postMessage({
            command: 'set_data',
            target: "main-tree",
            data: viewData.items
        });

        this.detailData = viewData.detailViews;
    }
}
