import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			obsidian: 'obsidian-test-mocks/obsidian',
			main: fileURLToPath(new URL('./src/main.ts', import.meta.url)),
			Base: fileURLToPath(new URL('./src/Base', import.meta.url)),
			Data: fileURLToPath(new URL('./src/Data', import.meta.url)),
			Types: fileURLToPath(new URL('./src/Types', import.meta.url)),
			Utils: fileURLToPath(new URL('./src/Utils.ts', import.meta.url)),
			Views: fileURLToPath(new URL('./src/Views', import.meta.url)),
		},
	},
	test: {
		include: ['test/**/*.test.ts'],
		setupFiles: ['obsidian-test-mocks/vitest-setup'],
		passWithNoTests: false,
		environment: 'jsdom',
		css: { include: [/styles\.css$/] },
		coverage: {
			provider: 'v8',
			include: ['src/**'],
			thresholds: {
				statements: 35,
				lines: 35,
				functions: 30,
				branches: 30,
			},
		},
	},
});
