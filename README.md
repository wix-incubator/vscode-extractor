# Extractor VSCode Plugin

Adds support for "extract to method" to VSCode.

![Example Image](https://file-zvwanozdyl.now.sh/extract.gif)

## NOTE: This extension is in a WIP state

## Features

- Extract to Class Method
- Extract to Global Function
- Extract to Inline Function
- Detects which extraction strategy is relevant to the selected code
- Detects external parameters *and their types*

## Known Issues

- Typescript breaks on extraction of code with types. Waiting for babel to separate Flow from the core package in order to support Typescript better.
- Doesnt support extracting commands with the `await` keyword

## Unknown Issues
- Quite a bit (probably)

### 0.1.0

Initial Release