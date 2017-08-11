import {
  window,
  ExtensionContext,
  commands,
  Range,
  TextEdit,
  workspace,
  WorkspaceEdit,
  Position
} from 'vscode';
import { getBindings, extractMethod } from './parser';
export function activate(context: ExtensionContext) {
  const disposable = commands.registerCommand('extension.extractMethod', async () => {
    try {
      const logicToExtract = window.activeTextEditor.document.getText(
        new Range(window.activeTextEditor.selection.start, window.activeTextEditor.selection.end)
      );
      const bindings = getBindings(logicToExtract);
      const functionType = await window.showQuickPick(['Class Method', 'Inline Method']);
      const functionName = await window.showInputBox({
        prompt: 'Function Name',
        value: `extractedMethod`
      });

      await replaceText(
        new Range(window.activeTextEditor.selection.start, window.activeTextEditor.selection.end),
        `this.${functionName}(${bindings.join(', ')})`
      );
      const newSource = extractMethod(
        window.activeTextEditor.document.getText(),
        logicToExtract,
        functionName,
        bindings
      );
      console.log(newSource);
      replaceText(
        new Range(
          new Position(0, 0),
          new Position(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
        ),
        newSource
      );
    } catch (e) {
      window.showWarningMessage(e.toString());
    }
  });

  context.subscriptions.push(disposable);
}

function replaceText(range, text) {
  const edit = new TextEdit(range, text);
  const workspaceEdit = new WorkspaceEdit();
  workspaceEdit.set(window.activeTextEditor.document.uri, [edit]);
  return workspace.applyEdit(workspaceEdit);
}

export function deactivate() {}
