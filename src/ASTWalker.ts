import { strict } from "assert";
import { ClangTools } from "./ClangTools";
import { ClassModel, MethodModel, FieldModel } from "./TranslationUnitModel";


export type ASTWalkResult<Result> = { result?: Result; error_message?: string };

export class ASTWalkContext {
    qualifierStack: string[] = [];
    classStack: ClassModel[] = [];
    result: ClassModel[] = [];
}

export class ASTWalker {

    private context: ASTWalkContext = new ASTWalkContext();

    constructor(private tools: ClangTools) { }

    private async visit(ast: any): Promise<{ cleanUp?: () => Promise<void> }> {
        if (ast.kind === "NamespaceDecl") {
            this.context.qualifierStack.push(ast.name);
            return {
                cleanUp: () => {
                    this.context.qualifierStack.pop();
                    return Promise.resolve();
                }
            };
        }
        else if (ast.kind === "CXXRecordDecl") {
            // An implicit CXXRecordDecl member with the same name as its enclosing class is always created for some reason.
            // Ignore it.
            if (ast.name === this.context.classStack.at(-1)?.name) {
                return {};
            }
            let fullName = this.context.qualifierStack.join("::") + "::" + ast.name;
            const thisClass = new ClassModel(ast.name, fullName, [], [], ast);
            this.context.classStack.push(thisClass);
            return {
                cleanUp: () => {
                    const lastClass = this.context.classStack.at(-1);
                    if (lastClass) {
                        this.context.result.push(lastClass);
                    }
                    return Promise.resolve();
                }
            };
        }
        else if (ast.kind === "CXXMethodDecl" ||
            ast.kind === "CXXConstructorDecl" ||
            ast.kind === "CXXDestructorDecl") {
            const memberName = ast.name as string;
            let demangledName = await this.tools.demangle(ast.mangledName);
            demangledName = (demangledName ?? memberName).trim();
            if (ast.kind === "CXXDestructorDecl") {
                ast.isDtor = true;
            } else if (ast.kind === "CXXConstructorDecl") {
                ast.isCtor = true;
            }
            this.context.classStack.at(-1)?.methods.push(new MethodModel(memberName, demangledName, ast));
        }
        else if (ast.kind === "FieldDecl") {
            this.context.classStack.at(-1)?.fields.push(new FieldModel(ast.name, ast));
        }
        return {};
    }

    private async walkRecursive(ast: any) {
        // modify context for children
        let result = await this.visit(ast);
        // walk thru children
        if (ast.inner) {
            for (let node of ast.inner) {
                await this.walkRecursive(node);
            }
        }
        // post visit (save result)
        if (result.cleanUp) {
            await result.cleanUp();
        }
    }

    private async walk(ast: any): Promise<ClassModel[]> {
        this.context = new ASTWalkContext();
        await this.walkRecursive(ast);
        return this.context.result;
    }

    async collectClasses(ast: any): Promise<ASTWalkResult<ClassModel[]>> {
        if (ast.kind !== "TranslationUnitDecl") {
            return { error_message: `Expected TranslationUnitDecl, got ${ast.kind}.` };
        }
        if (!ast.inner) {
            return { error_message: `Empty translation unit.` };
        }
        const classModels = await this.walk(ast);
        return { result: classModels };
    }
}