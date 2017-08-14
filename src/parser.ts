import { traverse } from 'babel-core';
import * as t from 'babel-types';
import { parse } from 'babylon';
import * as template from 'babel-template';
import generate from 'babel-generator';

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

export function getInformationOnSubNode(source, start, end, params) {
  let pathToInvestigate;
  const wholeAST = parse(source, {
    sourceType: 'module',
    plugins: PARSE_PLUGINS
  });
  traverse(wholeAST, {
    enter(path) {
      const loc = path.node.loc;
      if (
        loc &&
        loc.start.line === start._line &&
        loc.start.column === start._character &&
        loc.end.line === end._line &&
        loc.end.column === end._character
      ) {
        pathToInvestigate = path;
      }
    }
  });
  if (!pathToInvestigate) {
    return;
  }
  return {
    shouldAddReturnStatement: shouldAddReturnStatement(pathToInvestigate),
    paramTypes: getParamTypes(params, wholeAST)
  };
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

  // prettify this :) in fact, prettify this entire function
  if (text.trimRight().split('').splice(-1)[0] === ';') {
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

export function extractMethod(source, extractedLogic, functionName, params, shouldReturn, paramTypes) {
  let root;
  let logicAST = template(extractedLogic)();
  const visitor = {
    ClassDeclaration(path) {
      logicAST = shouldReturn ? t.returnStatement(logicAST.expression) : logicAST;
      path
        .get('body')
        .pushContainer(
          'body',
          t.classMethod(
            'method',
            t.identifier(functionName),
            compileParams(params, paramTypes),
            t.blockStatement([logicAST])
          )
        );
    }
  };

  const ast = parse(source, {
    sourceType: 'module',
    plugins: PARSE_PLUGINS
  });
  traverse(ast, visitor);
  return generate(ast).code;
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
