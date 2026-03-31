import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		setupFiles: ['test/setup.ts'],
		passWithNoTests: true,
		environment: 'jsdom',
		alias: {
			obsidian: 'obsidian-test-mocks',
		},
		coverage: {
			provider: 'v8',
			include: ['src/**'],
			thresholds: {
				lines: 0,
				functions: 0,
				branches: 0,
			},
		},
	},
});
