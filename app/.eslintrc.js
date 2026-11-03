// core/ is pure TypeScript: it may import only its own files. It talks to the
// outside world through ports (interfaces) that adapters/ implement.
// no-restricted-syntax is used instead of no-restricted-imports because ESLint 8's
// import patterns cannot express "allow relative paths, block every package".
const PACKAGE = '/^[^.]/';
const OUTER_LAYER = '/^\\.\\.\\/(adapters|ui|app)(\\/|$)/';
const MODULE_SOURCES = [
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
];

const coreBoundary = [
  ...MODULE_SOURCES.map(node => ({
    selector: `${node}[source.value=${PACKAGE}]`,
    message:
      'core/ must not import packages (react-native, native modules, ...). Define a port in core/ and implement it in adapters/.',
  })),
  ...MODULE_SOURCES.map(node => ({
    selector: `${node}[source.value=${OUTER_LAYER}]`,
    message: 'core/ must not depend on adapters/, ui/ or app/.',
  })),
  {
    selector: "CallExpression[callee.name='require']",
    message: 'core/ must not use require().',
  },
];

module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/ban-ts-comment': [
      'error',
      {
        'ts-ignore': true,
        'ts-nocheck': true,
        'ts-expect-error': 'allow-with-description',
      },
    ],
  },
  overrides: [
    {
      files: ['src/core/**/*.ts'],
      rules: { 'no-restricted-syntax': ['error', ...coreBoundary] },
    },
  ],
};
