import { BasesViewConfig } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_GROUP_ID } from '../src/Views/BoardConstants';
import { BoardOptionKeys, OptionsExtractor } from '../src/Views/OptionsExtractor';

function createConfig(values: Record<string, unknown> = {}): BasesViewConfig {
	return {
		get: (key: string) => values[key],
		set: vi.fn(),
	} as unknown as BasesViewConfig;
}

describe('OptionsExtractor', () => {
	it('reads both migrated axes and preserves explicit empty orders', () => {
		const options = new OptionsExtractor(
			createConfig({
				columnOrder: [],
				groupOrder: ['Old'],
				rowOrder: ['Bob', 'Empty Group'],
				subGroupOrder: ['Alice'],
			}),
		).extract();
		expect(options.columnOrder).toEqual([]);
		expect(options.rowOrder).toEqual(['Bob', EMPTY_GROUP_ID]);
	});

	it('does not restore an old order after the new option is cleared', () => {
		const options = new OptionsExtractor(
			createConfig({ columnOrder: null, groupOrder: ['Old'] }),
		).extract();
		expect(options.columnOrder).toEqual([]);
	});

	it('can read legacy custom options while their source is being migrated', () => {
		const options = new OptionsExtractor(
			createConfig({
				groupOrder: ['Todo', 'Done'],
				subGroupOrder: ['Alice', 'Bob'],
			}),
		).extract();
		expect(options.columnOrder).toEqual(['Todo', 'Done']);
		expect(options.rowOrder).toEqual(['Alice', 'Bob']);
	});

	it('does not treat a native group filter as column names on older hosts', () => {
		const config = Object.assign(
			createConfig({ groupOrder: ['Alice'], subGroupOrder: ['Bob'] }),
			{
				groupBy: { property: 'note.owner', direction: 'ASC' },
			},
		);
		const options = new OptionsExtractor(config).extract();
		expect(options.columnOrder).toEqual([]);
		expect(options.rowOrder).toEqual(['Bob']);
	});

	it('reads explicit Board order alongside a native group filter', () => {
		const config = Object.assign(
			createConfig({ columnOrder: ['Done', 'Todo'], groupOrder: ['Alice'] }),
			{
				groupBy: { property: 'note.owner', direction: 'ASC' },
			},
		);
		expect(new OptionsExtractor(config).extract().columnOrder).toEqual(['Done', 'Todo']);
	});
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

	it('reads the order property, unset by default', () => {
		expect(new OptionsExtractor(createConfig()).extract().orderProperty).toBeNull();
		const config = createConfig({ [BoardOptionKeys.ORDER_PROPERTY]: 'note.order' });
		expect(new OptionsExtractor(config).extract().orderProperty).toBe('note.order');
	});
});
