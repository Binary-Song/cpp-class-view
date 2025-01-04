import { assert } from "console";
import { EventEmitter } from "stream";

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

export interface MemberModel {
    get name(): string;
    get type(): string | undefined;
    get baseChain(): ClassModel[] | undefined;
}

export class MethodModel implements MemberModel {
    name: string;
    extra: IMethodAST;

    constructor(name: string, public fullName: string, extra: IMethodAST, public baseChain: ClassModel[] | undefined = undefined) {
        this.name = name;
        this.extra = extra;
    }

    get type() {
        return this.extra.type?.qualType;
    }
}
export interface IFieldAST {
    type?: {
        qualType?: string;
    };
}

export class FieldModel implements MemberModel {
    constructor(public name: string, public extra: IFieldAST, public baseChain: ClassModel[] | undefined = undefined) {
    }

    get type() {
        return this.extra.type?.qualType;
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

type FindBasesResult = { type: "ok", baseChain: ClassModel[] } | { type: "err", err: string };

export class ClassModel {
    name: string;
    methods: MethodModel[];
    fields: FieldModel[];
    extra: IClassAST;

    constructor(name: string, public fullName: string, methods: MethodModel[], fields: FieldModel[], extra: IClassAST) {
        this.name = ClassModel.trimClassName(name);
        this.fullName = ClassModel.trimClassName(fullName);
        this.methods = methods;
        this.fields = fields;
        this.extra = extra;
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

    public populateBaseMembers(allClasses: ClassModel[]) {
        this.findBasesRecursive(allClasses, [], (result) => {
            if (result.type === "ok") {
                const baseClass = result.baseChain.at(-1);
                for (const member of baseClass?.fields ?? []) {
                    this.fields.push(new FieldModel(member.name, member.extra, result.baseChain));
                }
                for (const member of baseClass?.methods ?? []) {
                    this.methods.push(new MethodModel(member.name, member.fullName, member.extra, result.baseChain));
                }
            } else {
                console.error(result.err);
            }
        });
    }

    private findBasesRecursive(allClasses: ClassModel[], currentBaseChain: ClassModel[], yieldResult: (result: FindBasesResult) => void) {
        const bases = this.extra.bases;
        if (!bases) {
            return;
        }

        const findClassByName = (fullName: string) => {
            for (const cls of allClasses) {
                if (ClassModel.classNameEq(fullName, cls.fullName)) {
                    return cls;
                }
            }
            return undefined;
        };

        for (const base of bases) {
            const baseClassName = base.type.qualType;
            const baseClass = findClassByName(baseClassName);
            if (!baseClass) {
                yieldResult({ type: "err", err: `Cannot find base class ${baseClassName} of class ${this.fullName}` });
            } else {
                const newBaseChain = [...currentBaseChain, baseClass];
                yieldResult({ type: "ok", baseChain: newBaseChain });
                baseClass.findBasesRecursive(allClasses, newBaseChain, yieldResult);
            }
        }
    }
}

export type TranslationUnitModel = { type: "err", err: string } |
{
    type: "ok",
    fileName: string,
    classes: ClassModel[]
};
