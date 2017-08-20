import { window, ExtensionContext, commands, Range, languages, TextEditorSelectionChangeEvent } from 'vscode';
import { extractMethod, getInformationOnSubNode, getScopeTypeByPath } from './parser';
import ExtractionProvider from './extractionProvider';

export function activate(context: ExtensionContext) {
  const extractionProvider = new ExtractionProvider();
  languages.registerCodeActionsProvider(['typescript', 'javascript'], extractionProvider);
  window.onDidChangeTextEditorSelection((e: TextEditorSelectionChangeEvent) => {
    extractionProvider.setSelectedRange(new Range(e.selections[0].start, e.selections[0].end));
  });
  const disposable = commands.registerCommand(
    'extension.extractMethod',
    async (subNodes, selectedText, sourceAST, functionParams, start, end, scopeType) => {
      try {
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
    }
  );

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
