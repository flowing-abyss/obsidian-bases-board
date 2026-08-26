import obsidianmd from 'eslint-plugin-obsidianmd';
import sonarjs from 'eslint-plugin-sonarjs';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(...obsidianmd.configs.recommended, sonarjs.configs.recommended, {
	plugins: {
		'@typescript-eslint': tseslint.plugin,
	},
	languageOptions: {
		parserOptions: {
			projectService: {
				allowDefaultProject: ['*.js', '*.mjs', '*.mts'],
			},
			tsconfigRootDir: import.meta.dirname,
		},
	},
	rules: {
		'@typescript-eslint/no-unused-vars': [
			'error',
			{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
		],
		'@typescript-eslint/no-floating-promises': 'error',
		'@typescript-eslint/no-misused-promises': 'error',
		'@typescript-eslint/await-thenable': 'error',
		'@typescript-eslint/require-await': 'error',
		'sonarjs/cognitive-complexity': ['error', 30],
	},
});
