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
import {
  getUnboundVariables,
  extractMethod,
  getNodeForPosition,
  getInformationOnSubNode,
  tweakLocation
} from './parser';
export function activate(context: ExtensionContext) {
  const disposable = commands.registerCommand('extension.extractMethod', async () => {
    try {
      // modify range if need to trim
      const logicToExtract = window.activeTextEditor.document.getText(
        new Range(window.activeTextEditor.selection.start, window.activeTextEditor.selection.end)
      );
      const functionParams = getUnboundVariables(logicToExtract);
      // const functionType = await window.showQuickPick([
      //   'Class Method',
      //   'Inline Function',
      //   'Global Function'
      // ]);
      const functionName = await window.showInputBox({
        prompt: 'Function Name',
        value: `extractedMethod`
      });

      const { start, end } = tweakLocation(
        window.activeTextEditor.selection.start,
        window.activeTextEditor.selection.end,
        logicToExtract
      );
      const logicNodeInformation = getInformationOnSubNode(
        window.activeTextEditor.document.getText(),
        start,
        end,
        functionParams
      );
      console.log(logicNodeInformation);
      // const logicToExtractNode = getNodeForPosition(
      //   window.activeTextEditor.document.getText(),
      //   window.activeTextEditor.selection.start,
      //   window.activeTextEditor.selection.end
      // );

      await replaceText(
        new Range(window.activeTextEditor.selection.start, window.activeTextEditor.selection.end),
        `this.${functionName}(${functionParams.join(', ')})`
      );
      const newSource = extractMethod(
        window.activeTextEditor.document.getText(),
        logicToExtract,
        functionName,
        functionParams,
        logicNodeInformation.shouldReturn,
        logicNodeInformation.variableTypes
      );
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
