import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
    {
        ignores: [
            "build/**",
            "coverage/**",
            "node_modules/**",
            "test-results/**",
        ],
    },
    js.configs.recommended,
    ...tsPlugin.configs["flat/recommended"].map((config) => ({
        ...config,
        files: ["src/**/*.ts", "test/**/*.ts"],
    })),
    ...tsPlugin.configs["flat/recommended-type-checked"].map((config) => ({
        ...config,
        files: ["src/**/*.ts", "test/**/*.ts"],
        languageOptions: {
            ...config.languageOptions,
            parser: tsParser,
            parserOptions: {
                ...config.languageOptions?.parserOptions,
                project: "./tsconfig.eslint.json",
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.node,
                ...globals.vitest,
            },
        },
    })),
    {
        files: ["src/**/*.ts", "test/**/*.ts"],
        rules: {
            "no-console": "error",
            "@typescript-eslint/no-empty-object-type": [
                "error",
                {
                    allowInterfaces: "with-single-extends",
                },
            ],
        },
    },
    eslintConfigPrettier,
];
