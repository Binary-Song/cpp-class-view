import { assert } from "console";

export interface IMethodAST {
    virtual?: boolean;
    pure?: boolean;
    constexpr?: boolean;
    mangledName?: string;
    type?: {
        qualType?: string;
    };
    isCtor?: boolean;
    isDtor?: boolean;
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
export interface IFieldAST {

}

export class FieldModel {
    constructor(public name: string, public extra: IFieldAST) {
    }

    get label(): string {
        return `${this.name}`;
    }
}

export interface IClassAST {
    bases?: {
        access: string,
        type: {
            qualType: string,
        },
    }[]
}

export class ClassModel {
    name: string;
    methods: MethodModel[];
    fields: FieldModel[];
    extra: IClassAST;

    constructor(name: string, public fullName: string, methods: MethodModel[], fields: FieldModel[], extra: IClassAST) {
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

    static trimClassName(name: string) {
        while (name.startsWith("::")) {
            name = name.slice(2);
        }
        return name;
    }

    static classNameEq(name1: string, name2: string) {
        return ClassModel.trimClassName(name1) === ClassModel.trimClassName(name2);
    }

    getBasesRecursive(classes: ClassModel[]): ClassModel[] {
        const bases = this.extra.bases;
        if (!bases) {
            return [];
        }
        classes = classes.filter((cur_cls) => {
            // remove self
            if (ClassModel.classNameEq(cur_cls.fullName, this.fullName)) {
                return false;
            }
            // find bases
            for (const base of bases) {
                if (ClassModel.classNameEq(cur_cls.fullName, base.type.qualType)) {
                    return true;
                }
            }
        });
        return classes;
    }
}
