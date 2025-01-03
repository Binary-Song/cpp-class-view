import { TranslationUnitModel } from "./TranslationUnitModel";
import * as vscode from 'vscode';

export class ClassViewWebViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    constructor(private readonly context: vscode.ExtensionContext, private _model: TranslationUnitModel) { }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true
        };
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        return Promise.resolve();
    }

    public get model() {
        return this._model;
    }

    public set model(value) {
        this._model = value;
        this.update();
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'media', 'style.css'));
        let contentHtml = "";
        if (this.model.type === "err") {
            contentHtml += `<div class="error-entry"> ${this.model.err} </div>`;
        } else {
            let classHtml = "";
            for (const cls of this.model.val) {
                let membersHtml = "";
                for (const field of cls.fields) {
                    membersHtml += `<div class="field-entry"> ${field.name} </div>`;
                }
                for (const method of cls.methods) {
                    membersHtml += `<div class="method-entry"> ${method.name} </div>`;
                }
                classHtml += `<div class="class-entry"> ${cls.name} ${membersHtml} </div>`;
            }
            contentHtml += classHtml;
        }
        return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Class View</title>
    <link href="${styleUri}" rel="stylesheet">
  </head>
  <body>
    ${contentHtml} 
  </body>
  </html>`;
    }

    public update() {
        if (this.view) {
            this.view.webview.html = this.getHtmlForWebview(this.view.webview);
        }
    }
}