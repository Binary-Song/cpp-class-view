import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Class, ClassViewDataProvider, Field, Method } from './ClassView';
import { ClangTools } from './ClangTools';

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
	const clangTools = ClangTools.create(clangPath + "/../");
	if (!clangTools) {
		const dir = path.dirname(clangPath);
		await vscode.window.showErrorMessage(`Class View will not be created because some of the clang tools are not available at ${dir}. Please update cpp-class-view.tools.clang in the settings.`, "OK");
		return;
	}

	const classView = new ClassViewDataProvider(
		clangTools
	);

	vscode.window.registerTreeDataProvider(
		'classView',
		classView
	);
}

export function deactivate() { }
