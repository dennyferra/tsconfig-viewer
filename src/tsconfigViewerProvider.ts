import * as vscode from 'vscode';
import * as path from 'path';
import { exec, ExecException } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class TsconfigViewerProvider {
  private currentPanel: vscode.WebviewPanel | undefined;
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Displays the TypeScript configuration file in a webview panel.
   * If a panel already exists, it brings it to focus. Otherwise, creates a new webview panel
   * with scripts disabled and context retained when hidden.
   *
   * @param configPath - The file path to the tsconfig json file to display
   */
  public async showConfig(configPath: string): Promise<void> {
    if (this.currentPanel) {
      this.currentPanel.reveal(vscode.ViewColumn.Beside, true);
    } else {
      this.currentPanel = vscode.window.createWebviewPanel(
        'tsconfigViewer',
        'TSConfig Viewer',
        vscode.ViewColumn.Beside,
        {
          enableScripts: false,
          retainContextWhenHidden: true,
        }
      );

      this.currentPanel.onDidDispose(() => {
        this.currentPanel = undefined;
      });
    }

    // Load and display the configuration
    await this.updateConfig(configPath);
  }

  /**
   * Refreshes the configuration display by reloading the config file.
   *
   * @param configPath - The file path to the TypeScript configuration file to refresh
   */
  public async refresh(configPath: string): Promise<void> {
    if (!this.currentPanel) {
      return;
    }

    await this.showConfig(configPath);
  }

  private async updateConfig(configPath: string): Promise<void> {
    if (!this.currentPanel) {
      return;
    }

    try {
      const config = await this.getResolvedConfig(configPath);
      this.currentPanel.webview.html = this.getWebviewContent(
        config,
        configPath
      );
    } catch (error) {
      let errorMessage;

      if (error instanceof Error) {
        errorMessage = error.message;

        // Add stdout from ExecException if available
        const e = error as ExecException;
        if (e.stdout) {
          errorMessage += `\n\n${e.stdout.toString()}`;
        }
      } else {
        errorMessage = String(error);
      }

      this.currentPanel.webview.html = this.getErrorContent(
        errorMessage,
        configPath
      );
    }
  }

  private async getResolvedConfig(configPath: string): Promise<string> {
    let tscCommand = 'tsc';
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(configPath)
    );

    if (workspaceFolder) {
      const localTsc = path.join(
        workspaceFolder.uri.fsPath,
        'node_modules',
        '.bin',
        'tsc'
      );

      const localTscCmd =
        process.platform === 'win32' ? `${localTsc}.cmd` : localTsc;

      try {
        await execAsync(`"${localTscCmd}" --version`);
        tscCommand = `"${localTscCmd}"`;
      } catch {
        console.log('Local TypeScript not found, falling back to global tsc');
      }
    }

    // Execute tsc --showConfig
    const command = `${tscCommand} --project "${configPath}" --showConfig`;
    this.outputChannel.appendLine(`Executing command:\n\t${command}`);

    try {
      const { stdout, stderr } = await execAsync(command);

      if (stderr && !stdout) {
        throw new Error(stderr);
      }

      return stdout || '{}';
    } catch (error: any) {
      // Check if tsc is not installed
      if (
        error.message?.includes('not found') ||
        error.message?.includes('not recognized')
      ) {
        throw new Error(
          'TypeScript compiler (tsc) not found. Please install TypeScript globally or in your workspace.'
        );
      }

      throw error;
    }
  }

  private getWebviewContent(config: string, configPath: string): string {
    const formattedConfig = this.formatJson(config);
    const relativePath = vscode.workspace.asRelativePath(configPath);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TSConfig Viewer</title>
    <style>
        body {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
        }
        .header {
            padding: 10px 15px;
            background-color: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-editorGroup-border);
            font-weight: 600;
        }
        .config-container {
            padding: 15px;
            overflow: auto;
            height: calc(100vh - 50px);
        }
        pre {
            margin: 0;
            padding: 10px;
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 3px;
            overflow-x: auto;
            user-select: text;
        }
        code {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            background-color: var(--vscode-editor-background);
        }
        .path {
            color: var(--vscode-textLink-foreground);
            font-size: 0.9em;
        }
        .json-key {
            color: #9cdcfe;
            font-weight: 500;
        }
        .json-string {
            color: #ce9178;
        }
        .json-number {
            color: #b5cea8;
        }
        .json-boolean,
        .json-null {
            color: #569cd6;
        }
        .json-punctuation {
            color: var(--vscode-editor-foreground);
        }
        
        [data-vscode-theme-kind="vscode-dark"] .json-key {
            color: #9cdcfe;
        }
        [data-vscode-theme-kind="vscode-dark"] .json-string {
            color: #ce9178;
        }
        [data-vscode-theme-kind="vscode-dark"] .json-number {
            color: #b5cea8;
        }
        [data-vscode-theme-kind="vscode-dark"] .json-boolean,
        [data-vscode-theme-kind="vscode-dark"] .json-null {
            color: #569cd6;
        }
        
        [data-vscode-theme-kind="vscode-light"] .json-key {
            color: #0451a5;
        }
        [data-vscode-theme-kind="vscode-light"] .json-string {
            color: #a31515;
        }
        [data-vscode-theme-kind="vscode-light"] .json-number {
            color: #098658;
        }
        [data-vscode-theme-kind="vscode-light"] .json-boolean,
        [data-vscode-theme-kind="vscode-light"] .json-null {
            color: #0000ff;
        }
    </style>
</head>
<body>
    <div class="header">
        TSConfig Viewer
        <div class="path">${this.escapeHtml(relativePath)}</div>
    </div>
    <div class="config-container">
        <pre><code>${this.highlightJson(formattedConfig)}</code></pre>
    </div>
</body>
</html>`;
  }

  private getErrorContent(error: string, configPath: string): string {
    const relativePath = vscode.workspace.asRelativePath(configPath);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TSConfig Viewer - Error</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .error {
            padding: 15px;
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 3px;
            margin-bottom: 15px;
        }
        .error-title {
            font-weight: 600;
            color: var(--vscode-errorForeground);
            margin-bottom: 10px;
        }
        .path {
            color: var(--vscode-textLink-foreground);
            font-size: 0.9em;
            margin-bottom: 10px;
        }
        pre {
            margin: 10px 0 0 0;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border-radius: 3px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="path">${this.escapeHtml(relativePath)}</div>
    <div class="error">
        <div class="error-title">⚠️ Error loading TSConfig</div>
        <pre>${this.escapeHtml(error)}</pre>
    </div>
</body>
</html>`;
  }

  private formatJson(json: string): string {
    try {
      const parsed = JSON.parse(json);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return json;
    }
  }

  private highlightJson(json: string): string {
    let highlighted = '';
    let i = 0;

    while (i < json.length) {
      const char = json[i];

      // Handle whitespace
      if (/\s/.test(char)) {
        highlighted += char;
        i++;
        continue;
      }

      // Handle strings (including keys)
      if (char === '"') {
        let stringContent = '"';
        i++;
        while (i < json.length) {
          const c = json[i];
          stringContent += c;
          if (c === '"' && json[i - 1] !== '\\') {
            i++;
            break;
          }
          i++;
        }

        // Determine if this is a key or value string
        let j = i;
        while (j < json.length && /\s/.test(json[j])) {
          j++;
        }
        const isKey = json[j] === ':';

        if (isKey) {
          highlighted += `<span class="json-key">${this.escapeHtml(
            stringContent
          )}</span>`;
        } else {
          highlighted += `<span class="json-string">${this.escapeHtml(
            stringContent
          )}</span>`;
        }
        continue;
      }

      // Handle numbers
      if (/[\d-]/.test(char)) {
        let numberContent = '';
        while (i < json.length && /[\d.eE+\-]/.test(json[i])) {
          numberContent += json[i];
          i++;
        }
        highlighted += `<span class="json-number">${numberContent}</span>`;
        continue;
      }

      // Handle booleans and null
      if (json.substring(i, i + 4) === 'true') {
        highlighted += `<span class="json-boolean">true</span>`;
        i += 4;
        continue;
      }
      if (json.substring(i, i + 5) === 'false') {
        highlighted += `<span class="json-boolean">false</span>`;
        i += 5;
        continue;
      }
      if (json.substring(i, i + 4) === 'null') {
        highlighted += `<span class="json-null">null</span>`;
        i += 4;
        continue;
      }

      // Handle punctuation
      if (/[{}[\]:,]/.test(char)) {
        highlighted += `<span class="json-punctuation">${char}</span>`;
        i++;
        continue;
      }

      // Default case
      highlighted += this.escapeHtml(char);
      i++;
    }

    return highlighted;
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
