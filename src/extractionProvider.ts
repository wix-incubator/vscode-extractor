import { CodeActionProvider, TextDocument, CodeActionContext, CancellationToken, Command, Range, window } from 'vscode';
import {
  getAST,
  findSubNodeByLocation,
  normalizeSelectedTextLocation,
  getUnboundVariables,
  getScopeTypeByPath
} from './parser';

export default class ExtractionProvider implements CodeActionProvider {
  selectedRange: Range;

  provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext,
    token: CancellationToken
  ): Command[] | Thenable<Command[]> {
    if (range.isEqual(this.selectedRange)) {
      const selectedText = this.getSelectedText();
      const { start, end } = normalizeSelectedTextLocation(
        window.activeTextEditor.selection.start,
        window.activeTextEditor.selection.end,
        selectedText
      );
      const sourceAST = getAST(window.activeTextEditor.document.getText());
      const subNodes = findSubNodeByLocation(sourceAST, start, end);
      const functionParams = getUnboundVariables(selectedText);
      const scopeTypes: string[] = <string[]>Array.from(getScopeTypeByPath(subNodes[0])).sort();
      return scopeTypes.map(scopeType => ({
        title: scopeType,
        command: 'extension.extractMethod',
        arguments: [subNodes, selectedText, sourceAST, functionParams, start, end, scopeType]
      }));
    }
  }

  setSelectedRange(selectedRange: Range) {
    this.selectedRange = selectedRange;
  }

  getSelectedText() {
    return window.activeTextEditor.document.getText(
      new Range(window.activeTextEditor.selection.start, window.activeTextEditor.selection.end)
    );
  }
}
