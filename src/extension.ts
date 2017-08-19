import { window, ExtensionContext, commands, Range, TextEdit, workspace, WorkspaceEdit, Position } from 'vscode';
import {
  getUnboundVariables,
  extractMethod,
  getInformationOnSubNode,
  normalizeSelectedTextLocation,
  SCOPE_TYPES,
  findSubNodeByLocation,
  getAST,
  getScopeTypeByPath
} from './parser';

export function activate(context: ExtensionContext) {
  const disposable = commands.registerCommand('extension.extractMethod', async () => {
    try {
      // modify range if need to trim
      const selectedText = getSelectedText();
      const { start, end } = normalizeSelectedTextLocation(
        window.activeTextEditor.selection.start,
        window.activeTextEditor.selection.end,
        selectedText
      );
      const sourceAST = getAST(window.activeTextEditor.document.getText());
      const subNodes = findSubNodeByLocation(sourceAST, start, end);
      const functionParams = getUnboundVariables(selectedText);
      const scopeType = await getScopeType(subNodes[0]);
      if (!scopeType) {
        return;
      }
      const functionName = await getFunctionName();
      if (!functionName) {
        return;
      }
      const { shouldAddReturnStatement, paramTypes } = getInformationOnSubNode(subNodes, sourceAST, functionParams);

      const newSource = extractMethod(
        sourceAST,
        selectedText,
        start,
        end,
        functionName,
        functionParams,
        scopeType,
        shouldAddReturnStatement,
        paramTypes
      );
    } catch (e) {
      window.showWarningMessage('Selected block should represent set of statements or an expression');
    }
  });

  context.subscriptions.push(disposable);
}

function getSelectedText() {
  return window.activeTextEditor.document.getText(
    new Range(window.activeTextEditor.selection.start, window.activeTextEditor.selection.end)
  );
}

function getScopeType(path) {
  const scopeTypes: string[] = Array.from(getScopeTypeByPath(path));
  return window.showQuickPick(scopeTypes.sort());
}

function getFunctionName() {
  return window.showInputBox({
    prompt: 'Function Name',
    value: `extractedMethod`
  });
}

export function deactivate() {}
