# Extractor VSCode Plugin

Adds support for "extract to method" to VSCode.

## NOTE: You should probably use the internal extract to function feature of VSCode

![Example Image](https://file-zvwanozdyl.now.sh/extract.gif)

## NOTE: This extension is in a WIP state

## Features

- Extract to Class Method
- Extract to Global Function
- Extract to Inline Function
- Detects which extraction strategy is relevant to the selected code
- Detects external parameters *and their types*

## How to Use

Select some text and press `cmd+.`

## Known Issues

- Doesnt support extracting commands with the `await` keyword

## Unknown Issues
- Quite a bit (probably)

### 0.3.0

Fix Typescript issue by upgrading to babel-template 7

### 0.2.0

Load Typescript/Flow by file type

### 0.1.0

Initial Release