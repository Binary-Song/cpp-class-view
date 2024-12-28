import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ClassView, ClassViewDataProvider, FieldView, MethodView } from './ClassView';
import { ClangTools } from './ClangTools';
import { ExtensionInterface } from './ExtensionInterface';

async function tryInitClangPath() {
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

class ExtensionImpl implements ExtensionInterface {

	output: vscode.OutputChannel;

	constructor(public context: vscode.ExtensionContext) {
		this.output = vscode.window.createOutputChannel("Class View");
	}

	showOutputPanel() {
		this.output.show();
	}

	writeOutput(text: string) {
		this.output.appendLine(text);
	}
}

export async function activate(context: vscode.ExtensionContext) {

	const config = vscode.workspace.getConfiguration('cpp-class-view');
	let clangPath = config.get('tools.clang') as string | undefined;
	if (!clangPath) {
		clangPath = await tryInitClangPath();
		if (clangPath) {
			await config.update('tools.clang', clangPath, vscode.ConfigurationTarget.Global);
		}
	}
	if (!clangPath) {
		await vscode.window.showErrorMessage(`Class View will not be created because Clang was not found. Please set cpp-class-view.tools.clang in the settings.`, "OK");
		return;
	}
	const ext = new ExtensionImpl(context);
	const clangTools = ClangTools.create(clangPath + "/../", ext);
	if (!clangTools) {
		const dir = path.dirname(clangPath);
		await vscode.window.showErrorMessage(`Class View will not be created because some of the clang tools are not available in ${dir}. Please update cpp-class-view.tools.clang in the settings.`, "OK");
		return;
	}
	const classViewDataProvider = new ClassViewDataProvider(
		clangTools,
		ext,

	);

	vscode.window.registerTreeDataProvider(
		'cpp-class-view.classView.classes',
		classViewDataProvider
	);

	vscode.window.createTreeView('cpp-class-view.classView.classes', {
		treeDataProvider: classViewDataProvider,
	});

	vscode.commands.executeCommand('setContext', 'cpp-class-view.classView.isFlattened', classViewDataProvider.flat);
	vscode.commands.registerCommand(
		"cpp-class-view.showOutputPanel",
		() => {
			ext.showOutputPanel();
		}
	);
	vscode.commands.registerCommand('cpp-class-view.refresh', () =>
		classViewDataProvider.refresh()
	);
	vscode.commands.registerCommand('cpp-class-view.classView.flatten', () => {
		classViewDataProvider.flatten();
	}
	);
	vscode.commands.registerCommand('cpp-class-view.classView.unflatten', () => {
		classViewDataProvider.unflatten();
	}
	);
	vscode.commands.executeCommand('setContext', 'cpp-class-view.classView.isFlattened', classViewDataProvider.flat);
}

export function deactivate() { }
