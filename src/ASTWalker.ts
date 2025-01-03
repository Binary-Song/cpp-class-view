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

    constructor(private tools: ClangTools) { }

    private async visit(ast: any, context: ASTWalkContext): Promise<{ context: ASTWalkContext, cleanUp?: (context: ASTWalkContext) => Promise<void> }> {
        if (ast.kind === "NamespaceDecl") {
            context.qualifierStack.push(ast.name);
            return {
                context: context,
                cleanUp: (context) => {
                    context.qualifierStack.pop();
                    return Promise.resolve();
                }
            };
        }
        else if (ast.kind === "CXXRecordDecl") {
            // An implicit CXXRecordDecl member with the same name as its enclosing class is always created for some reason.
            // Ignore it.
            if (ast.name === context.classStack.at(-1)?.name) {
                return { context: context };
            }
            const className = context.qualifierStack.join("::") + "::" + ast.name;
            const thisClass = new ClassModel(ast.name, className, [], [], ast);
            context.classStack.push(thisClass);
            return {
                context: context,
                cleanUp: (context: ASTWalkContext) => {
                    const lastClass = context.classStack.at(-1);
                    if (lastClass) {
                        context.result.push(lastClass);
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
            context.classStack.at(-1)?.methods.push(new MethodModel(demangledName, ast));
        }
        else if (ast.kind === "FieldDecl") {
            context.classStack.at(-1)?.fields.push(new FieldModel(ast.name, ast));
        }
        return { context: context };
    }

    private async walkRecursive(ast: any, context: ASTWalkContext) {
        // modify context for children
        let result = await this.visit(ast, context);
        context = result.context;
        // walk thru children
        if (ast.inner) {
            for (let node of ast.inner) {
                await this.walkRecursive(node, context);
            }
        }
        // post visit (save result)
        if (result.cleanUp) {
            await result.cleanUp(context);
        }
    }

    private async walk(ast: any): Promise<ClassModel[]> {
        let context: ASTWalkContext = new ASTWalkContext();
        await this.walkRecursive(ast, context);
        return context.result;
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