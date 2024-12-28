import * as vscode from 'vscode';
import { ClangTools } from './ClangTools';
import { ExtensionInterface } from './ExtensionInterface';
import { ClassModel, FieldModel, MethodModel } from './ClassModel';


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
        return this.model.extra.type?.qualType ?? "";
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

    constructor(private model: ClassModel, public viewContext: ViewContext) {
        super();
    }
    get digest() {
        return `class(${this.model.name})`;
    }
    get children(): IView[] {

        const fields: IView[] = this.model.fields.map(field => new FieldView(field, this.viewContext));

        const methods: IView[] = this.model.methods.map(method => new MethodView(method, this.viewContext));

        return fields.concat(methods);
    }
    get description(): string {
        return "";
    }
    get icon(): string {
        return "symbol-class";
    }
    get label(): string {
        return this.model.name;
    }
}

export class ClassListView extends BasicView {
    constructor(private classModels: ClassModel[], public viewContext: ViewContext, private flat = false,) {
        super();
    }
    get digest() {
        return `classes`;
    }
    get children(): IView[] {
        let members: IView[] = [];
        let index = 0;
        if (this.flat) {
            for (const classModel of this.classModels) {
                for (const fieldModel of classModel.fields) {
                    members.push(new FieldView(fieldModel, this.viewContext));
                }
                for (const methodModel of classModel.methods) {
                    members.push(new MethodView(methodModel, this.viewContext));
                }
            }
            return members;
        } else {
            return this.classModels.map((classModel, idx) => new ClassView(classModel, this.viewContext));
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
    private rootView: IView | undefined;

    constructor(
        private compiler: ClangTools,
        private ext: ExtensionInterface) {
    }

    getTreeItem(element: IView): vscode.TreeItem {
        return element.treeItem;
    }

    async handleRecordDecl(recordDecl: any) {
        let methods: MethodModel[] = [];
        let fields: FieldModel[] = [];
        if (!recordDecl.inner) {
            return undefined;
        }
        for (let member of recordDecl.inner) {
            if (member.kind === "CXXMethodDecl") {
                const memberName = member.name as string;
                let demangledName = await this.compiler.demangle(member.mangledName);
                demangledName = (demangledName ?? memberName);
                methods.push(new MethodModel(demangledName.trim(), member));
            } else if (member.kind === "FieldDecl") {
                fields.push(new FieldModel(member.name ?? ""));
            }
        }
        return new ClassModel(recordDecl.name ?? "", methods, fields, recordDecl);
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
        const cdb_path = this.compiler.findCompilationDatabase(file);
        if (!cdb_path) {
            return this.createError("Compilation database not found.");
        }
        this.ext.writeOutput("Using compilation database: " + cdb_path);
        const args = this.compiler.getCompileArgs(cdb_path, file);
        if (!args) {
            return this.createError("Compilation database not found.");
        }
        const ast_str = await this.compiler.compile(args);
        if (!ast_str) {
            return this.createError("Failed to compile source file.");
        }
        const ast = JSON.parse(ast_str);
        if (!ast) {
            return this.createError("Clang did not output valid json data.");
        }
        if (ast.kind !== "TranslationUnitDecl") {
            return this.createError(`Expected TranslationUnitDecl, got ${ast.kind}.`);
        }
        let classList: ClassModel[] = [];
        if (!ast.inner) {
            return this.createError(`No inner structure in TranslationUnitDecl.`);
        }
        let idx = -1;
        for (let node of ast.inner) {
            idx++;
            if (node.kind === "CXXRecordDecl") {
                const newClass = await this.handleRecordDecl(node);
                if (newClass) {
                    classList.push(newClass);
                }
            }
        }
        return new ClassListView(classList, new ViewContext(), this.flat);
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
}
