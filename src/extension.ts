import * as vscode from 'vscode';
import { ClassData, ClassView, FieldData, MethodData } from './ClassView';

export function activate(context: vscode.ExtensionContext) {

	const classView = new ClassView(
		[
			new ClassData("Class1", [new MethodData("Method1")], [new FieldData("Field1")])
		]
	);

	vscode.window.registerTreeDataProvider(
		'classView',
		classView
	);
}

export function deactivate() { }
