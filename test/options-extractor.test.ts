import { BasesViewConfig } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { BoardOptionKeys, OptionsExtractor } from '../src/Views/OptionsExtractor';

function createConfig(values: Record<string, unknown> = {}): BasesViewConfig {
	return {
		get: (key: string) => values[key],
		set: vi.fn(),
	} as unknown as BasesViewConfig;
}

describe('OptionsExtractor boolean defaults', () => {
	it('preserves explicit false values for options that default to true', () => {
		const config = createConfig({
			[BoardOptionKeys.COLOR_HEADERS]: false,
			[BoardOptionKeys.COLOR_CARDS]: false,
			[BoardOptionKeys.HIDE_IMAGE_PLACEHOLDER]: false,
		});

		const options = new OptionsExtractor(config).extract();

		expect(options.colorHeaders).toBe(false);
		expect(options.colorCards).toBe(false);
		expect(options.hideImagePlaceholder).toBe(false);
	});

	it('uses the registered defaults when values are absent', () => {
		const options = new OptionsExtractor(createConfig()).extract();

		expect(options.colorHeaders).toBe(true);
		expect(options.colorCards).toBe(true);
		expect(options.hideImagePlaceholder).toBe(true);
		expect(options.colorCells).toBe(false);
		expect(options.newNoteOpen).toBe(false);
		expect(options.hideEmptyProperties).toBe(false);
	});

	it('reads the hide empty properties toggle', () => {
		const config = createConfig({ [BoardOptionKeys.HIDE_EMPTY_PROPERTIES]: true });

		expect(new OptionsExtractor(config).extract().hideEmptyProperties).toBe(true);
	});
});
