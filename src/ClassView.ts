import * as vscode from 'vscode';
import { ClangTools } from './ClangTools';


// 节点中的数据。不包含 parent 指针。
export interface IData {
    getChildren(): IData[];

    label: string;
    description?: string;
    icon?: string;
    collapsibleState?: vscode.TreeItemCollapsibleState;
}

export class List<T extends IData> implements IData {

    items: T[];
    label: string;
    description?: string;
    icon?: any;

    constructor(label: string, items: T[], description?: string, icon?: any) {
        this.label = label;
        this.description = description;
        this.items = items;
        this.icon = icon;
    }

    getChildren(): IData[] { return this.items; }
}

export interface IClassExtraData
{
}

export class Class implements IData {
    name: string;
    methods: Method[];
    fields: Field[];
    icon: string;
    extra: IClassExtraData;

    constructor(name: string, methods: Method[], fields: Field[], extra: IClassExtraData) {
        this.name = name;
        this.methods = methods;
        this.fields = fields;
        this.icon = "symbol-class";
        this.extra = extra;
    }

    get label() {
        return this.name;
    }

    get description() {
        return "";
    }

    getChildren(): IData[] {
        let children: IData[] = [];
        return children.concat(this.methods, this.fields);
    }
}

export interface IMethodExtraData {
    virtual?: boolean;
    pure?: boolean;
    constexpr?: boolean;
    type?: {
        qualType?: string;
    };
}

export class Method implements IData {

    name: string;
    collapsibleState: vscode.TreeItemCollapsibleState;
    icon: string;
    extra: IMethodExtraData;

    constructor(name: string, extra: IMethodExtraData) {
        this.name = name;
        this.icon = "symbol-method";
        this.extra = extra;
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }

    get label(): string {
        return `${this.name}`;
    }

    get description(): string {
        let desc = "";
        if (this.extra.pure) {
            desc += "[pure] ";
        }
        if (this.extra.virtual) {
            desc += "[virtual] ";
        }
        if (this.extra.constexpr) {
            desc += "[constexpr] ";
        }
        if (this.extra.type) {
            desc += (this.extra.type.qualType  ?? "");
        }
        return desc.trim();
    }

    getChildren(): IData[] {
        return [];
    }
}

export class Field implements IData {

    name: string;
    collapsibleState: vscode.TreeItemCollapsibleState;
    icon: string;

    constructor(name: string) {
        this.name = name;
        this.icon = "symbol-field";
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }

    get label(): string {
        return `${this.name}`;
    }

    getChildren(): IData[] {
        return [];
    }
}

// 树上的结点。包含 parent 指针。只用来包装 IData 。
// 子节点一般需要时才生成。
export interface INode {
    getId(): string;
    getTreeItem(): vscode.TreeItem;
    getChildren(): Thenable<INode[]>;
}

export class Node<T extends IData> implements INode {

    parent: INode | undefined;
    data: T;
    index: number;

    constructor(parent: INode | undefined, index: number, data: T) {
        this.parent = parent;
        this.data = data;
        this.index = index;
    }

    getId(): string {
        return `${this.parent?.getId() ?? ""}/${this.index}`;
    }

    getTreeItem(): vscode.TreeItem {
        return {
            resourceUri:  vscode.Uri.file("E:/cpp-class-view/README.md"),
            label: this.data.label,
            description: this.data.description,
            id: this.getId(),
            iconPath: this.data.icon ? new vscode.ThemeIcon(this.data.icon) : undefined,
            collapsibleState: this.data.collapsibleState ?? vscode.TreeItemCollapsibleState.Collapsed
        };
    }

    getChildren(): Thenable<INode[]> {
        const children = this.data.getChildren();
        return Promise.resolve(children.map((child, index) => new Node(this, index, child)));
    }
}

export class ClassViewDataProvider implements vscode.TreeDataProvider<INode> {

    compiler: ClangTools;

    constructor(compiler: ClangTools) {
        this.compiler = compiler;
    }

    getTreeItem(element: INode): vscode.TreeItem {
        return element.getTreeItem();
    }

    async getRootItem(): Promise<INode[]> {
        const ast_str = await this.compiler.compile(["E:/cpp-class-view/test.cpp"]);
        if (!ast_str) {
            return [];
        }
        const ast = JSON.parse(ast_str);
        if (!ast) {
            return [];
        }
        if (ast.kind !== "TranslationUnitDecl") {
            return [];
        }
        let classList: Class[] = [];
        ast.inner?.forEach((node: any) => {
            if (node.kind === "CXXRecordDecl") {
                const isImplicit = node.isImplicit ?? false;

                let methods: Method[] = [];
                let fields: Field[] = [];
                node.inner?.forEach((member: any) => {
                    if (member.kind === "CXXMethodDecl") {
                        methods.push(new Method(member.name ?? "@unnamed", member));
                    } else if (member.kind === "FieldDecl") {
                        fields.push(new Field(member.name ?? "@unnamed"));
                    }
                });
                classList.push(new Class(node.name ?? "@unnamed", methods, fields, node));
            }
        });
        return classList.map((classData, idx) => new Node(undefined, idx, classData));
    }

    getChildren(element?: INode): Thenable<INode[]> {
        this.compiler.compile(["E:/cpp-class-view/test.cpp"]);
        if (element) {
            return element.getChildren();
        } else {
            return this.getRootItem();
        }
    }
}
