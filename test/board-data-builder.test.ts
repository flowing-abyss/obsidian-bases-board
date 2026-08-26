import type { BasesQueryResult, BasesViewConfig } from 'obsidian';
import { App, BasesEntry } from 'obsidian-test-mocks/obsidian';
import { describe, expect, it, vi } from 'vitest';
import Services from '../src/Base/Services';
import { EMPTY_GROUP_ID } from '../src/Views/BoardConstants';
import { BoardViewDataBuilder } from '../src/Views/BoardDataBuilder';

describe('BoardViewDataBuilder empty states', () => {
	it('keeps a default column so an empty board can create its first note', () => {
		Services.settings = { columnColors: {} };
		const data = { data: [] } as unknown as BasesQueryResult;
		const config = {
			getOrder: vi.fn(() => []),
		} as unknown as BasesViewConfig;

		const board = new BoardViewDataBuilder(data, config).build({});

		expect(board.columns).toEqual([
			expect.objectContaining({ id: EMPTY_GROUP_ID, title: 'Empty group', count: 0 }),
		]);
		expect(board.items[EMPTY_GROUP_ID]).toEqual({});
		expect(board.rows).toEqual([]);
	});

	it('uses the internal default bucket without rendering a fake subgroup row', () => {
		const app = App.createConfigured__({ files: { 'tasks/first.md': '' } });
		Services.app = app.asOriginalType__();
		Services.settings = { columnColors: {} };
		const file = app.vault.getFileByPath('tasks/first.md');
		expect(file).not.toBeNull();
		if (!file) return;
		const entry = BasesEntry.create__({}, file).asOriginalType__();
		const data = { data: [entry] } as unknown as BasesQueryResult;
		const config = {
			getOrder: vi.fn(() => []),
		} as unknown as BasesViewConfig;

		const board = new BoardViewDataBuilder(data, config).build({});

		expect(board.rows).toEqual([]);
		expect(board.items[EMPTY_GROUP_ID]?.default).toHaveLength(1);
	});
});
