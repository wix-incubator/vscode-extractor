import { traverse } from 'babel-core';
import * as t from 'babel-types';
import { parse } from 'babylon';
import * as template from 'babel-template';
import generate from 'babel-generator';
import { TextEdit, window, workspace, Range, Position, WorkspaceEdit } from 'vscode';

export const SCOPE_TYPES = {
  CLASS_METHOD: 'Class Method',
  INLINE_FUNCTION: 'Inline Function',
  GLOBAL_FUNCTION: 'Global Function'
};

const PARSE_PLUGINS = [
  'typescript',
  'jsx',
  // 'flow',
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
export function getAST(source) {
  return parse(source, {
    sourceType: 'module',
    plugins: PARSE_PLUGINS
  });
}

export function getInformationOnSubNode(subNode, sourceAST, functionParams) {
  return {
    shouldAddReturnStatement: shouldAddReturnStatement(subNode),
    paramTypes: getParamTypes(functionParams, sourceAST)
  };
}

export function findSubNodeByLocation(ast, start, end, cb?) {
  let subNodePath;
  traverse(ast, {
    enter(path) {
      const loc = path.node.loc;
      if (
        loc &&
        loc.start.line === start._line &&
        loc.start.column === start._character &&
        loc.end.line === end._line &&
        loc.end.column === end._character
      ) {
        subNodePath = path;
        cb && cb(path);
      }
    }
  });
  return subNodePath;
}

export function normalizeSelectedTextLocation(start, end, text) {
  const tweakedStart = {
    _line: start._line + 1,
    _character: start._character + (text.length - text.trimLeft().length)
  };
  const tweakedEnd = { _line: end._line + 1, _character: end._character };
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
  return { start: tweakedStart, end: tweakedEnd };
}

function shouldAddReturnStatement(path) {
  return (
    path && (t.isVariableDeclarator(path.parent) || t.isIfStatement(path.parent) || t.isLogicalExpression(path.parent))
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

// deprecated
export function getNodeForPosition(source, start, end) {
  const node = parse(source, {
    sourceType: 'module',
    plugins: PARSE_PLUGINS
  });
  const finalResult = findNodeWithLocation(node, start, end);
  return finalResult;

  function findNodeWithLocation(node, start, end) {
    const properties = Object.keys(node);
    let nodeWithLocation;
    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      if (node.hasOwnProperty(property) && isNode(node[property])) {
        const loc = node[property].loc;
        if (
          loc &&
          loc.start.line === start._line + 1 &&
          loc.start.column === start._character &&
          loc.end.line === end._line + 1 &&
          loc.end.column === end._character - 1
        ) {
          return node[property];
        }
        if (!nodeWithLocation) {
          nodeWithLocation = findNodeWithLocation(node[property], start, end);
        }
      }
    }
    return nodeWithLocation;
  }
  function isNode(node) {
    return (
      node &&
      (node.__proto__.constructor.name === 'Node' ||
        (Array.isArray(node) && node.length && node[0].__proto__.constructor.name === 'Node'))
    );
  }
}

export function getUnboundVariables(source) {
  let root;
  const identifiers = {};
  const visitor = {
    Program(path) {
      root = path;
    },
    Identifier(path) {
      if (!root.scope.bindings[path.node.name] && !t.isMemberExpression(path.parent)) {
        identifiers[path.node.name] = true;
      }
    }
  };

  const ast = parse(source, {
    sourceType: 'module',
    plugins: PARSE_PLUGINS
  });
  traverse(ast, visitor);
  return Object.keys(identifiers);
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
  findSubNodeByLocation(sourceAST, start, end, path => {
    const parentPath = findParentByScopeType(path, scopeType);
    const logicAST = shouldAddReturnStatement
      ? t.returnStatement(template(extractedLogic)().expression)
      : template(extractedLogic)();
    const functionCallAST = template(
      `${scopeType === SCOPE_TYPES.CLASS_METHOD ? 'this.' : ''}${functionName}(${functionParams.join(', ')})`
    )();

    createFunctionInParentByScopeType(parentPath, scopeType, logicAST, functionName, functionParams, paramTypes);
    path.replaceWith(functionCallAST);
  });

  const newSource = generate(sourceAST).code;
  await replaceCurrentEditorContent(newSource);
}

function createFunctionInParentByScopeType(parentPath, scopeType, logicAST, functionName, functionParams, paramTypes) {
  if (scopeType === SCOPE_TYPES.CLASS_METHOD) {
    parentPath
      .get('body')
      .pushContainer(
        'body',
        t.classMethod(
          'method',
          t.identifier(functionName),
          compileParams(functionParams, paramTypes),
          t.blockStatement([logicAST])
        )
      );
  } else {
    let nodeToPushTo;
    if (Array.isArray(parentPath.node.body)) {
      nodeToPushTo = parentPath.node.body;
    } else if (parentPath.node.body && parentPath.node.body.body && Array.isArray(parentPath.node.body.body)) {
      nodeToPushTo = parentPath.node.body.body;
    }
    nodeToPushTo.push(
      t.functionDeclaration(
        t.identifier(functionName),
        compileParams(functionParams, paramTypes),
        t.blockStatement([logicAST])
      )
    );
  }
}

function findParentByScopeType(path, scopeType) {
  if (!path) {
    return;
  }
  if (scopeType === SCOPE_TYPES.INLINE_FUNCTION && (t.isFunction(path.parentPath) || !path.parentPath)) {
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
