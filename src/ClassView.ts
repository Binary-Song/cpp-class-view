import * as vscode from 'vscode';
import { ClangTools } from './ClangTools';
import { ExtensionInterface } from './ExtensionInterface';
import { ClassModel, FieldModel, MethodModel } from './ClassModel';
import { ASTWalker } from './ASTWalker';


export class ViewContext {
    private views = new Map<IView, string>();
    private digests = new Map<string, number>();
    get_or_create_id(view: IView): string {
        if (this.views.has(view)) {
            return this.views.get(view) ?? "";
        }
        if (this.digests.has(view.digest)) {
            let num = this.digests.get(view.digest) ?? 1;
            num += 1;
            this.digests.set(view.digest, num);
            const id = `${view.digest} (${num})`;
            this.views.set(view, id);
            return id;
        } else {
            this.digests.set(view.digest, 1);
            const id = `${view.digest} (1)`;
            this.views.set(view, id);
            return id;
        }
    }
}

export interface IView {
    get children(): IView[];
    get collapsibleState(): vscode.TreeItemCollapsibleState;
    get description(): string;
    get id(): string;
    get digest(): string;
    get icon(): string;
    get label(): string;
    get viewContext(): ViewContext;
    get treeItem(): vscode.TreeItem;
}

export abstract class BasicView implements IView {
    abstract get children(): IView[];
    abstract get digest(): string;
    abstract get description(): string;
    abstract get icon(): string;
    abstract get label(): string;
    abstract get viewContext(): ViewContext;
    get collapsibleState(): vscode.TreeItemCollapsibleState {
        if (this.children.length > 0) {
            return vscode.TreeItemCollapsibleState.Collapsed;
        }
        return vscode.TreeItemCollapsibleState.None;
    }
    get id(): string {
        return this.viewContext.get_or_create_id(this);
    }
    get treeItem(): vscode.TreeItem {
        return {
            label: this.label,
            id: this.id,
            iconPath: new vscode.ThemeIcon(this.icon),
            description: this.description,
            collapsibleState: this.collapsibleState,
        };
    }
}

export class MethodView extends BasicView {

    constructor(private model: MethodModel, public viewContext: ViewContext) {
        super();
    }
    get digest() {
        return `method(${this.model.name}, ${this.model.extra.type?.qualType})`;
    }
    get children(): IView[] {
        return [];
    }
    get description(): string {
        if (this.model.extra.isDtor) {
            return "destructor";
        } else if (this.model.extra.isCtor) {
            return "constructor";
        }
        return "method";
    }
    get icon(): string {
        return "symbol-method";
    }
    get label(): string {
        return this.model.name;
    }
}

export class FieldView extends BasicView {
    constructor(private model: FieldModel, public viewContext: ViewContext) {
        super();
    }
    get digest() {
        return `field(${this.model.name})`;
    }
    get children(): IView[] {
        return [];
    }
    get description(): string {
        return "";
    }
    get icon(): string {
        return "symbol-field";
    }
    get label(): string {
        return this.model.name;
    }
}

export class ClassView extends BasicView {

    constructor(private model: ClassModel,
        private allClasses: ClassModel[],
        public viewContext: ViewContext,
        public includeInherited: boolean) {
        super();
    }
    get digest() {
        return `class(${this.model.name})`;
    }
    get children(): IView[] {
        let fieldModels = this.model.fields;
        let methodModels = this.model.methods;

        if (this.includeInherited) {
            for (const baseClass of this.model.getBasesRecursive(this.allClasses)) {
                fieldModels = fieldModels.concat(baseClass.fields);
                methodModels = methodModels.concat(baseClass.methods);
            }
        }

        let fields: IView[] = fieldModels.map(field => new FieldView(field, this.viewContext)).sort((a, b) => a.label.localeCompare(b.label));
        let methods: IView[] = methodModels.map(method => new MethodView(method, this.viewContext)).sort((a, b) => a.label.localeCompare(b.label));
        let members = fields.concat(methods);
        return members;
    }

    get description(): string {
        return "";
    }
    get icon(): string {
        return "symbol-class";
    }
    get label(): string {
        return this.model.fullName;
    }
}

export class ClassListView extends BasicView {
    constructor(private classModels: ClassModel[], public viewContext: ViewContext, private flat = false, private showInherited = false) {
        super();
    }
    get digest() {
        return `classes`;
    }
    get children(): IView[] {
        let members: IView[] = [];
        if (this.flat) {
            for (const classModel of this.classModels) {
                const view = new ClassView(classModel, this.classModels, this.viewContext, this.showInherited);
                let cur_members = view.children;
                members = members.concat(cur_members, view.children);
            }
            members = members.sort((a, b) => a.label.localeCompare(b.label));
            return members;
        } else {
            return this.classModels.map(
                classModel => {
                    return new ClassView(classModel, this.classModels, this.viewContext, this.showInherited);
                }
            ).sort((a, b) => a.label.localeCompare(b.label));
        }
    }
    get description(): string {
        return "";
    }
    get icon(): string {
        return "";
    }
    get label(): string {
        return "";
    }
}

export class ErrorMessageView extends BasicView {

    constructor(public message: string, public viewContext: ViewContext) {
        super();
    }
    get digest() {
        return "error";
    }
    get children(): IView[] {
        return [];
    }
    get description(): string {
        return "";
    }
    get icon(): string {
        return "error";
    }
    get label(): string {
        return this.message;
    }
    get treeItem(): vscode.TreeItem {
        let item = super.treeItem;
        item.command = {
            title: "Go to output",
            command: "cpp-class-view.showOutputPanel",
        };
        item.tooltip = this.message + "\n" + "Click to go to output.";
        return item;
    }
}

export class ViewList extends BasicView {

    subViews: IView[] = [];

    constructor(public viewContext: ViewContext) {
        super();
    }
    addChild(view: IView) {
        this.subViews.push(view);
    }
    get digest() {
        return "viewlist";
    }
    get children(): IView[] {
        return this.subViews;
    }
    get description(): string {
        return "";
    }
    get icon(): string {
        return "";
    }
    get label(): string {
        return "";
    }
}

export class ClassViewDataProvider implements vscode.TreeDataProvider<IView> {

    private hardReset = true;
    public flat = false;
    public showInherited = false;
    private rootView: IView | undefined;

    constructor(
        private tools: ClangTools,
        private ext: ExtensionInterface) {
    }

    getTreeItem(element: IView): vscode.TreeItem {
        return element.treeItem;
    }

    createError(text: string) {
        let list = new ViewList(new ViewContext());
        let error = new ErrorMessageView(text, new ViewContext());
        list.addChild(error);
        return list;
    }

    async updateClassList(): Promise<IView> {
        const file = vscode.window.activeTextEditor?.document.uri.fsPath;
        if (!file) {
            return this.createError("Active document does not exist or is not a file.");
        }
        if (vscode.window.activeTextEditor?.document.languageId !== "cpp") {
            return this.createError("Active document is not a C++ file.");
        }
        const cdb_path = this.tools.findCompilationDatabase(file);
        if (!cdb_path) {
            return this.createError("Compilation database not found.");
        }
        this.ext.writeOutput("Using compilation database: " + cdb_path);
        const args = this.tools.getCompileArgs(cdb_path, file);
        if (!args) {
            return this.createError("Compilation database not found.");
        }
        const ast_str = await this.tools.compile(args);
        if (!ast_str) {
            return this.createError("Failed to compile source file.");
        }

        const ast = JSON.parse(ast_str);
        if (!ast) {
            return this.createError("Clang did not output valid json data.");
        }

        const astWalker = new ASTWalker(this.tools);
        const res = await astWalker.collectClasses(ast);
        if (res.error_message) {
            return this.createError(res.error_message);
        }
        if (res.result === undefined) {
            return this.createError("Unknown error.");
        }
        return new ClassListView(res.result, new ViewContext(), this.flat);
    }

    async getChildren(element?: IView): Promise<IView[]> {
        if (element) {
            return Promise.resolve(element.children);
        } else {
            if (this.hardReset) {
                this.rootView = await this.updateClassList();
            }
            return this.rootView?.children ?? [];
        }
    }

    private _onDidChangeTreeData: vscode.EventEmitter<IView | undefined | null | void> = new vscode.EventEmitter<IView | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<IView | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    flatten() {
        this.hardReset = false;
        this.flat = true;
        this.refresh();
        this.hardReset = true;
        vscode.commands.executeCommand('setContext', 'cpp-class-view.classView.isFlattened', this.flat);
    }

    unflatten() {
        this.hardReset = false;
        this.flat = false;
        this.refresh();
        this.hardReset = true;
        vscode.commands.executeCommand('setContext', 'cpp-class-view.classView.isFlattened', this.flat);
    }

    setShowInherited(show: boolean) {
        this.hardReset = false;
        this.showInherited = show;
        this.refresh();
        this.hardReset = true;
	    vscode.commands.executeCommand('setContext', 'cpp-class-view.classView.isInheritedShown', show);
    }
}
