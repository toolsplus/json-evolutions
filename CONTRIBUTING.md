# Contributing to this repository

This document describes how to set up your development environment to build and test.

## Prerequisite software

Before you can build and test, you must install and configure the following products on your development machine:

* [Git](https://git-scm.com/)

* [Node.js](https://nodejs.org), (version specified in the engines field of [`package.json`](./package.json)) which is used to run tests, and generate distributable files.

## Getting the sources

```shell
git clone https://github.com/toolsplus/json-evolutions.git
cd json-evolutions
```

## Installing NPM modules

Next, install the JavaScript modules needed to build and test:

```shell
npm install
```

## Building

To build run:

```shell
npm run build
```

* Results are put in the `build` folder.

## Running tests locally

```shell
npm run test
```

## Formatting source code

This project uses [prettier](https://prettier.io/) to format source code.
If the source code is not properly formatted the CI will fail, and the PR cannot be merged.

You can automatically format your code by running:

``` shell
$ npm run fix:prettier
```

A better way is to set up your IDE to format the changed file on each file save. 

## Linting/verifying your source code

This project uses [ESLint](https://eslint.org/) to enforce coding styles and quality.
If the source code is not following the configured styles the CI will fail, and the PR cannot be merged.

You can check that your code is properly formatted and adheres to coding style by running:

``` shell
$ npm run lint
```

A better way is to set up your IDE to run ESLint on each file save.

## Coding rules

To ensure consistency throughout the source code, keep these rules in mind as you are working:

* All features or bug fixes **must be tested** by one or more specs (unit-tests).
* All public API methods **must be documented**.

## Commit message format

This project follows very precise rules over how our Git commit messages must be formatted.
This format leads to **easier to read commit history** and allows us to do [automatic generation of version numbers and changelog during the release process](https://github.com/semantic-release/semantic-release).

Commit messages must follow the [Angular commit convention](https://github.com/conventional-changelog/commitlint/tree/master/%40commitlint/config-angular). This convention is enforced by a Git commit hook. If you use an IDE to commit your changes, and it fails, refer to the IDE's Git console for details.
