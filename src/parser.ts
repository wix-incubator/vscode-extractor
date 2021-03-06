import { traverse } from 'babel-core';
import * as t from 'babel-types';
import { parse } from 'babylon';
import template from 'babel-template';
import generate from 'babel-generator';
import { TextEdit, window, workspace, Range, Position, WorkspaceEdit } from 'vscode';
export const SCOPE_TYPES = {
  CLASS_METHOD: 'Class Method',
  INLINE_FUNCTION: 'Inline Function',
  GLOBAL_FUNCTION: 'Global Function'
};
const PARSE_PLUGINS = [
  'asyncFunctions',
  'classConstructorCall',
  'doExpressions',
  'trailingFunctionCommas',
  'objectRestSpread',
  'decorators',
  'classProperties',
  'exportExtensions',
  'exponentiationOperator',
  'asyncGenerators',
  'functionBind',
  'functionSent'
];
function getPlugins() {
  if (/typescript/.test(window.activeTextEditor.document.languageId)) {
    return [...PARSE_PLUGINS, 'typescript'];
  }
  return [...PARSE_PLUGINS, 'flow', 'jsx'];
}
export function getAST(source) {
  try {
    return parse(source, {
      sourceType: 'module',
      plugins: getPlugins()
    });
  } catch (e) {
    console.log(e);
  }
}
export function getInformationOnSubNode(subNodes, sourceAST, functionParams) {
  return {
    shouldAddReturnStatement: shouldAddReturnStatement(subNodes),
    paramTypes: getParamTypes(functionParams, sourceAST)
  };
}
export function findSubNodeByLocation(ast, start, end) {
  let subNodePaths = [];
  let found = false;
  traverse(ast, {
    enter(path) {
      const loc = path.node.loc;

      if (!found && loc.start.line === start._line && loc.start.column === start._character) {
        if (!path.inList) {
          if (loc.end.line === end._line && loc.end.column <= end._character + 1) {
            found = true;
            subNodePaths.push(path);
          }
        } else {
          found = true;

          for (let i = path.key; i < path.container.length; i++) {
            const siblingPath = path.getSibling(i);
            const loc = siblingPath.node.loc;

            if (loc.end.line < end._line || (loc.end.line === end._line && loc.end.column <= end._character + 1)) {
              subNodePaths.push(siblingPath);
            }
          }
        }
      }
    }
  });

  return subNodePaths;
}
export function normalizeSelectedTextLocation(start, end, text) {
  const tweakedStart = {
    _line: start._line + 1,
    _character: start._character + (text.length - text.trimLeft().length)
  };
  const tweakedEnd = {
    _line: end._line + 1,
    _character: end._character
  };

  if (tweakedEnd._character > 0) {
    tweakedEnd._character -= text.length - text.trimRight().length;
  }

  const splittedText = text.split('\n');

  for (let i = 0; i < splittedText.length; i++) {
    if (splittedText[i].trim() === '') {
      tweakedStart._line++;
    } else {
      break;
    }
  }

  for (let i = splittedText.length - 1; i > 0; i--) {
    if (splittedText[i].trim() === '') {
      tweakedEnd._line--;
    } else {
      break;
    }
  }

  if (tweakedEnd._character <= 0) {
    const trimmedRightSplittedText = text.trimRight().split('\n');
    tweakedEnd._character =
      trimmedRightSplittedText.slice(-1)[0].length +
      (trimmedRightSplittedText.length === 1 ? tweakedStart._character : 0);
  }

  if (text.trimRight().slice(-1) === ';') {
    tweakedEnd._character--;
  }

  return {
    start: tweakedStart,
    end: tweakedEnd
  };
}

function shouldAddReturnStatement(paths) {
  if (paths.length > 1) {
    return false;
  }

  const path = paths[0];
  return (
    path &&
    (t.isVariableDeclarator(path.parent) ||
      t.isIfStatement(path.parent) ||
      t.isLogicalExpression(path.parent) ||
      t.isFunction(path) ||
      t.isArrowFunctionExpression(path.parent) ||
      t.isConditionalExpression(path.parent) ||
      t.isLabeledStatement(path.parent) ||
      t.isObjectProperty(path.parent) ||
      path.listKey === 'arguments')
  );
}

function getParamTypes(params, ast) {
  const variableTypes = {};
  traverse(ast, {
    Identifier(path) {
      if (params.indexOf(path.node.name) > -1 && path.node.typeAnnotation) {
        variableTypes[path.node.name] = path.node.typeAnnotation;
      }
    }
  });
  return variableTypes;
}

export function getUnboundVariables(source) {
  let root;
  const identifiers = {};
  const visitor = {
    Program(path) {
      root = path;
    },

    Identifier(path) {
      if (
        !root.scope.bindings[path.node.name] &&
        !t.isMemberExpression(path.parent) &&
        !t.isObjectProperty(path.parent) &&
        !t.isLabeledStatement(path.parent) &&
        !t.isVariableDeclarator(path.parent)
      ) {
        identifiers[path.node.name] = true;
      }
    }
  };
  const ast = parse(source, {
    sourceType: 'module',
    plugins: getPlugins()
  });
  traverse(ast, visitor);
  return Object.keys(identifiers);
}

function generateTemplate(code) {
  return template(code, {
    plugins: getPlugins()
  });
}

export async function extractMethod(
  sourceAST,
  extractedLogic,
  start,
  end,
  functionName,
  functionParams,
  scopeType,
  shouldAddReturnStatement,
  paramTypes
) {
  const paths = findSubNodeByLocation(sourceAST, start, end);
  const parentPath = findParentByScopeType(paths[0], scopeType);
  const logicAST = generateTemplate(`${shouldAddReturnStatement ? 'return ' : ''}${extractedLogic}`)();
  const functionCallAST = generateTemplate(
    `${scopeType === SCOPE_TYPES.CLASS_METHOD ? 'this.' : ''}${functionName}(${functionParams.join(', ')})`
  )();
  createFunctionInParentByScopeType(parentPath, scopeType, logicAST, functionName, functionParams, paramTypes);
  removeExcessNodes(paths);
  replaceNodeWithFunctionCall(functionCallAST);

  const newSource = generate(sourceAST).code;
  await replaceCurrentEditorContent(newSource);

  function replaceNodeWithFunctionCall(functionCallAST) {
    paths[0].replaceWith(functionCallAST);
  }

  function removeExcessNodes(path) {
    paths.slice(1).forEach(path => path.remove());
  }
}

function createFunctionInParentByScopeType(parentPath, scopeType, logicAST, functionName, functionParams, paramTypes) {
  try {
    if (scopeType === SCOPE_TYPES.CLASS_METHOD) {
      createClassMethod(functionName, compileParams, functionParams, paramTypes, logicAST);
    } else {
      createFunctionDeclaration(functionName, compileParams, functionParams, paramTypes, logicAST);
    }
  } catch (e) {
    console.log(e);
  }

  function createClassMethod(functionName, compileParams, functionParams, paramTypes, logicAST) {
    parentPath
      .get('body')
      .pushContainer(
        'body',
        t.classMethod(
          'method',
          t.identifier(functionName),
          compileParams(functionParams, paramTypes),
          t.blockStatement(Array.isArray(logicAST) ? logicAST : [logicAST])
        )
      );
  }

  function createFunctionDeclaration(functionName, compileParams, functionParams, paramTypes, logicAST) {
    let nodeToPushTo;

    if (parentPath.node.body && Array.isArray(parentPath.node.body)) {
      nodeToPushTo = parentPath.node.body;
    } else if (parentPath.node.body && parentPath.node.body.body && Array.isArray(parentPath.node.body.body)) {
      nodeToPushTo = parentPath.node.body.body;
    }

    nodeToPushTo.push(
      t.functionDeclaration(
        t.identifier(functionName),
        compileParams(functionParams, paramTypes),
        t.blockStatement(Array.isArray(logicAST) ? logicAST : [logicAST])
      )
    );
  }
}

function findParentByScopeType(path, scopeType) {
  if (!path) {
    return;
  }

  if (
    scopeType === SCOPE_TYPES.INLINE_FUNCTION &&
    ((t.isFunction(path.parentPath) && path.parentPath.node.body && path.parentPath.node.body.body) || !path.parentPath)
  ) {
    return path.parentPath;
  }

  if (scopeType === SCOPE_TYPES.CLASS_METHOD && t.isClassDeclaration(path.node)) {
    return path;
  }

  if (scopeType === SCOPE_TYPES.GLOBAL_FUNCTION && !path.parentPath) {
    return path;
  }

  return findParentByScopeType(path.parentPath, scopeType);
}

function compileParams(params, paramTypes) {
  return params.map(param => {
    const identifier = t.identifier(param);

    if (paramTypes && paramTypes[param]) {
      identifier.typeAnnotation = paramTypes[param];
    }

    return identifier;
  });
}

function replaceText(range, text) {
  const edit = new TextEdit(range, text);
  const workspaceEdit = new WorkspaceEdit();
  workspaceEdit.set(window.activeTextEditor.document.uri, [edit]);
  return workspace.applyEdit(workspaceEdit);
}

function replaceCurrentEditorContent(newSource) {
  return replaceText(
    new Range(new Position(0, 0), new Position(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)),
    newSource
  );
}

export function getScopeTypeByPath(path, scopeTypes = new Set([SCOPE_TYPES.GLOBAL_FUNCTION])) {
  if (!path.parentPath) {
    return scopeTypes;
  }

  if (
    (t.isFunction(path.parentPath) && path.parentPath.node.body && path.parentPath.node.body.body) ||
    !path.parentPath
  ) {
    scopeTypes.add(SCOPE_TYPES.INLINE_FUNCTION);
  }

  if (t.isClassDeclaration(path.node)) {
    scopeTypes.add(SCOPE_TYPES.CLASS_METHOD);
  }

  return getScopeTypeByPath(path.parentPath, scopeTypes);
}
