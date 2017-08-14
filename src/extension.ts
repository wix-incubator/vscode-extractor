import { window, ExtensionContext, commands, Range, TextEdit, workspace, WorkspaceEdit, Position } from 'vscode';
import {
  getUnboundVariables,
  extractMethod,
  getNodeForPosition,
  getInformationOnSubNode,
  normalizeSelectedTextLocation
} from './parser';

const SCOPE_TYPES = {
  CLASS_METHOD: 'Class Method',
  INLINE_FUNCTION: 'Inline Function',
  GLOBAL_FUNCTION: 'Global Function'
};

export function activate(context: ExtensionContext) {
  const disposable = commands.registerCommand('extension.extractMethod', async () => {
    try {
      // modify range if need to trim
      const selectedText = getSelectedText();
      const functionParams = getUnboundVariables(selectedText);
      const scopeType = await getScopeType();
      if (!scopeType) {
        return;
      }
      const functionName = await getFunctionName();
      if (!functionName) {
        return;
      }
      const { start, end } = normalizeSelectedTextLocation(
        window.activeTextEditor.selection.start,
        window.activeTextEditor.selection.end,
        selectedText
      );
      const { shouldAddReturnStatement, paramTypes } = getInformationOnSubNode(
        window.activeTextEditor.document.getText(),
        start,
        end,
        functionParams
      );

      // order is important
      await replaceSelectedTextWithFunctionCall(start, end, functionName, functionParams, scopeType);
      const newSource = extractMethod(
        window.activeTextEditor.document.getText(),
        selectedText,
        functionName,
        functionParams,
        shouldAddReturnStatement,
        paramTypes
      );
      await replaceCurrentEditorContent(newSource);
    } catch (e) {
      window.showWarningMessage(e.toString());
    }
  });

  context.subscriptions.push(disposable);
}

function getSelectedText() {
  return window.activeTextEditor.document.getText(
    new Range(window.activeTextEditor.selection.start, window.activeTextEditor.selection.end)
  );
}

function getScopeType() {
  return window.showQuickPick(Object.keys(SCOPE_TYPES).map(scopeKey => SCOPE_TYPES[scopeKey]));
}

function getFunctionName() {
  return window.showInputBox({
    prompt: 'Function Name',
    value: `extractedMethod`
  });
}

function replaceText(range, text) {
  const edit = new TextEdit(range, text);
  const workspaceEdit = new WorkspaceEdit();
  workspaceEdit.set(window.activeTextEditor.document.uri, [edit]);
  return workspace.applyEdit(workspaceEdit);
}

function replaceSelectedTextWithFunctionCall(start, end, functionName, functionParams, scopeType) {
  return replaceText(
    new Range(window.activeTextEditor.selection.start, window.activeTextEditor.selection.end),
    `${scopeType === SCOPE_TYPES.CLASS_METHOD ? 'this.' : ''}${functionName}(${functionParams.join(', ')})`
  );
}

function replaceCurrentEditorContent(newSource) {
  return replaceText(
    new Range(new Position(0, 0), new Position(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)),
    newSource
  );
}

export function deactivate() {}
