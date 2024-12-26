import * as vscode from 'vscode';

// 树上的结点。包含 parent 指针。见 TreeDataNode 。
export interface TreeNode {
    getId(): string;
    getTreeItem(): vscode.TreeItem;
    getChildren(): Thenable<TreeNode[]>;
}

// 节点中的数据。不需要知道 parent 。由于不包含 parent 指针，构造方便，可以脱离树结构作为独立的子树。
export interface TreeData {
    getName(): string;
    getDescription(): string;
    getChildren(): TreeData[];
    icon?: any;
}

// TreeNode 的主要实现类型。一般用来将 TreeData 包装一层，保存 parent 指针。
export class TreeDataNode<T extends TreeData> implements TreeNode {

    parent: TreeNode | undefined;
    data: T;

    constructor(parent: TreeNode | undefined, data: T) {
        this.parent = parent;
        this.data = data;
    }

    getId(): string {
        return `${this.parent?.getId() ?? ""}/${this.data.getName()}`;
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.data.getDescription(),
            id: this.getId(),
            iconPath: this.data.icon ?? undefined,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        };
    }

    getChildren(): Thenable<TreeNode[]> {
        const children = this.data.getChildren();
        return Promise.resolve(children.map(child => new TreeDataNode(this, child)));
    }
}

export class TreeDataList<T extends TreeData> implements TreeData {

    items: T[];
    name: string;
    desc: string;

    constructor(name: string, desc: string, items: T[]) {
        this.name = name;
        this.desc = desc;
        this.items = items;
    }

    getName(): string { return this.name; }
    getDescription(): string { return this.desc; }
    getChildren(): TreeData[] { return this.items; }
}

export class ClassData implements TreeData {
    name: string;
    methods: TreeDataList<MethodData>;
    fields: TreeDataList<FieldData>;

    constructor(name: string, methods: MethodData[], fields: FieldData[]) {
        this.name = name;
        this.methods = new TreeDataList("Methods", "Methods", methods);
        this.fields =  new TreeDataList("Fields", "Fields", fields);
    }

    getName(): string {
        return this.name;
    }
    getDescription(): string {
        return `Class ${this.name}`;
    }
    getChildren(): TreeData[] {
        return [this.methods, this.fields];
    }
}

export class MethodData implements TreeData {

    name: string;

    constructor(name: string) {
        this.name = name;
    }

    getName(): string {
        return this.name;
    }

    getDescription(): string {
        return `Method ${this.name}`;
    }

    getChildren(): TreeData[] {
        return [];
    }
}

export class FieldData implements TreeData {

    name: string;

    constructor(name: string) {
        this.name = name;
    }

    getName(): string {
        return this.name;
    }

    getDescription(): string {
        return `Field ${this.name}`;
    }

    getChildren(): TreeData[] {
        return [];
    }
}

export class ClassView implements vscode.TreeDataProvider<TreeNode> {

    rootNode: TreeDataNode<TreeDataList<ClassData>>;

    constructor(classes: ClassData[]) {
        this.rootNode = new TreeDataNode(undefined, new TreeDataList("Classes", "Classes", classes));
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element.getTreeItem();
    }

    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (element) {
            return element.getChildren();
        } else {
            return this.rootNode.getChildren();
        }
    }
}