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

export function getBindings(source) {
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

export function extractMethod(source, extractedLogic, functionName, params) {
  let root;
  const logicAST = template(extractedLogic)();
  const visitor = {
    ClassDeclaration(path) {
      console.log('CLASS');
      path
        .get('body')
        .pushContainer(
          'body',
          t.classMethod(
            'method',
            t.identifier(functionName),
            params.map(param => t.identifier(param)),
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
