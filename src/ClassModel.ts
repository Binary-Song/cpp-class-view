
export interface IMethodAST {
    virtual?: boolean;
    pure?: boolean;
    constexpr?: boolean;
    mangledName?: string;
    type?: {
        qualType?: string;
    };
}

export class MethodModel {
    name: string;
    extra: IMethodAST;

    constructor(name: string, extra: IMethodAST) {
        this.name = name;
        this.extra = extra;
    }

    get label(): string {
        return `${this.name}`;
    }

    get description(): string {
        let desc = "";
        if (this.extra.type) {
            desc += (this.extra.type.qualType ?? "");
        }
        return desc.trim();
    }
}

export class FieldModel {

    name: string;

    constructor(name: string) {
        this.name = name;
    }

    get label(): string {
        return `${this.name}`;
    }
}

export interface IClassAST {
}

export class ClassModel {
    name: string;
    methods: MethodModel[];
    fields: FieldModel[];
    extra: IClassAST;

    constructor(name: string, methods: MethodModel[], fields: FieldModel[], extra: IClassAST) {
        this.name = name;
        this.methods = methods;
        this.fields = fields;
        this.extra = extra;
    }

    get label() {
        return this.name;
    }

    get description() {
        return "";
    }
}
