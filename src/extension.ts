import * as vscode from 'vscode';
import { TsconfigViewerProvider } from './tsconfigViewerProvider';

let currentTsconfigUri: vscode.Uri | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let provider: TsconfigViewerProvider;

export function activate(context: vscode.ExtensionContext) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('TSConfig Viewer');
    context.subscriptions.push(outputChannel);
  }

  if (!provider) {
    provider = new TsconfigViewerProvider(outputChannel);
  }

  registerSubscriptions(context);
  outputChannel.appendLine('TSConfig Viewer activated');
}

function registerSubscriptions(context: vscode.ExtensionContext) {
  // Register command to show TSConfig
  const commandShowConfig = vscode.commands.registerCommand(
    'tsconfig-viewer.showConfig',
    handleCommandShowConfig
  );
  context.subscriptions.push(commandShowConfig);

  // Listen to active editor changes
  const editorChangeSubscription = vscode.window.onDidChangeActiveTextEditor(
    handleActiveEditorChange
  );
  context.subscriptions.push(editorChangeSubscription);

  // Listen to document saves
  const documentSaveSubscription =
    vscode.workspace.onDidSaveTextDocument(handleDocumentSave);
  context.subscriptions.push(documentSaveSubscription);
}

function isTsconfigFile(fileName: string) {
  const normalized = fileName.replace(/\\/g, '/');
  const baseName = normalized.split('/').pop() || '';
  return /^tsconfig(\..*?)?\.json$/i.test(baseName);
}

async function handleCommandShowConfig() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const fileName = editor.document.fileName;
  if (!isTsconfigFile(fileName)) {
    vscode.window.showWarningMessage(
      'Please open a tsconfig.json or tsconfig.*.json file'
    );
    return;
  }

  await provider.showConfig(fileName);
}

async function handleActiveEditorChange(editor: vscode.TextEditor | undefined) {
  const doc = editor?.document;
  if (!doc) return;
  if (!isTsconfigFile(doc.fileName || '')) return;

  if (
    !currentTsconfigUri ||
    doc.uri.toString() !== currentTsconfigUri.toString()
  ) {
    currentTsconfigUri = doc.uri;
    await provider.refresh(doc.fileName);
  }
}

async function handleDocumentSave(doc: vscode.TextDocument) {
  if (!isTsconfigFile(doc.fileName)) return;
  if (
    currentTsconfigUri &&
    doc.uri.toString() === currentTsconfigUri.toString()
  ) {
    await provider.refresh(doc.fileName);
  }
}
