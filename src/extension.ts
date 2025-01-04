import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ClangTools } from './ClangTools';
import { ExtensionInterface } from './ExtensionInterface';
import { ClassViewWebViewProvider } from './ClassViewWebViewProvider';
import { TranslationUnitModel } from './TranslationUnitModel';
import { ASTWalker } from './ASTWalker';

class ExtensionMain implements ExtensionInterface {

	output: vscode.OutputChannel;
	tools: ClangTools;

	static async create(context: vscode.ExtensionContext) {

		const config = vscode.workspace.getConfiguration('cpp-class-view');
		let clangPath = config.get('tools.clang') as string | undefined;
		if (!clangPath) {
			clangPath = await ExtensionMain.tryInitClangPath();
			if (clangPath) {
				await config.update('tools.clang', clangPath, vscode.ConfigurationTarget.Global);
			}
		}
		if (!clangPath) {
			await vscode.window.showErrorMessage(`Class View will not be created because Clang was not found. Please set cpp-class-view.tools.clang in the settings.`, "OK");
			return;
		}
		const clangToolsDir = clangPath + "/../";
		const ext = new ExtensionMain(undefined, context);
		const tools = ClangTools.create(clangToolsDir, ext);
		if (!tools) {
			return undefined;
		}
		ext.tools = tools;
		return ext;
	}

	static async tryInitClangPath() {
		let defaultClangPath = '/usr/bin/clang';
		if (process.platform === 'win32') {
			defaultClangPath = 'C:/Program Files/LLVM/bin/clang.exe';
		}
		if (fs.existsSync(defaultClangPath)) {
			const answer = await vscode.window.showInformationMessage(`Use clang at ${defaultClangPath} to parse source files?`, "Yes", "No");
			if (!answer || answer === "No") {
				return undefined;
			}
			return defaultClangPath;
		}
		return undefined;
	}

	private constructor(clangTools: ClangTools | undefined, public context: vscode.ExtensionContext) {
		this.output = vscode.window.createOutputChannel("Class View");
		this.tools = clangTools as ClangTools;
	}

	private createError(text: string): TranslationUnitModel {
		return { type: "err", err: text };
	}

	async getModel(): Promise<TranslationUnitModel> {
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
		this.writeOutput("Using compilation database: " + cdb_path);
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
		return { type: "ok", fileName: file, classes: res.result };
	}

	showOutputPanel() {
		this.output.show();
	}

	writeOutput(text: string) {
		this.output.appendLine(text);
	}
}

export async function activate(context: vscode.ExtensionContext) {
	const ext = await ExtensionMain.create(context);
	if (!ext) {
		await vscode.window.showErrorMessage(`Failed to initialize extension.`, "OK");
		return;
	}
	const model = await ext.getModel();
	const webviewProv = await ClassViewWebViewProvider.create(context, model);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("cpp-class-view.classView", webviewProv)
	);
	context.subscriptions.push(vscode.commands.registerCommand('cpp-class-view.refreshClassView',
		async () => {
			const model = await ext.getModel();
			await webviewProv.setModel(model);
		}));
}

export function deactivate() { }
