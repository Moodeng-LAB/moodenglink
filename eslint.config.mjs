import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		// Root-level tool configs (this file included) live outside tsconfig.eslint.json's
		// `include` and don't need type-aware linting.
		ignores: ["dist/**", "coverage/**", "node_modules/**", "eslint.config.mjs", "tsup.config.ts", "vitest.config.ts"],
	},
	{
		files: ["src/**/*.ts", "tests/**/*.ts", "bench/**/*.ts"],
		extends: [tseslint.configs.recommended],
		languageOptions: {
			parserOptions: {
				project: ["./tsconfig.eslint.json"],
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// The two rules this config exists for: catch an un-awaited promise
			// (a mistake) vs. an intentionally fire-and-forgotten one (must be
			// prefixed with `void`, which the codebase already does throughout).
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-misused-promises": "error",
			// Idiomatic in this codebase: `_manager` params on Plugin's overridable
			// no-op stubs, and `const { op, ...stats } = payload` to omit one field.
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
		},
	},
	{
		// Tests lean on loosely-typed mocks/casts (`as never`, `as unknown as X`)
		// to shape fakes — that's a deliberate tradeoff for test ergonomics, not
		// a correctness issue worth flagging the way it would be in src/.
		files: ["tests/**/*.ts", "bench/**/*.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	eslintConfigPrettier,
);
