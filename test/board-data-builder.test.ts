import type { BasesQueryResult, BasesViewConfig } from 'obsidian';
import { App, BasesEntry, StringValue } from 'obsidian-test-mocks/obsidian';
import { describe, expect, it, vi } from 'vitest';
import Services from '../src/Base/Services';
import { EMPTY_GROUP_ID } from '../src/Views/BoardConstants';
import { BoardViewDataBuilder } from '../src/Views/BoardDataBuilder';

describe('BoardViewDataBuilder empty states', () => {
	it('keeps both axis orders, empty groups and newly discovered values', () => {
		const app = App.createConfigured__({ files: { 'task.md': '' } });
		Services.app = app.asOriginalType__();
		Services.settings = { columnColors: {} };
		const entry = BasesEntry.create__({}, app.vault.getFileByPath('task.md')!);
		entry.setValue__('note.status', StringValue.create__('New status').asOriginalType__());
		entry.setValue__('note.owner', StringValue.create__('New owner').asOriginalType__());
		const board = new BoardViewDataBuilder(
			{ data: [entry.asOriginalType__()] } as unknown as BasesQueryResult,
			{ getOrder: () => [], getSort: () => [] } as unknown as BasesViewConfig,
		).build({
			groupProperty: 'note.status',
			subGroupProperty: 'note.owner',
			columnOrder: ['Done', 'Todo', EMPTY_GROUP_ID],
			rowOrder: ['Bob', 'Alice', EMPTY_GROUP_ID],
		});
		expect(board.columns.map((column) => column.id)).toEqual([
			'Done',
			'Todo',
			EMPTY_GROUP_ID,
			'New status',
		]);
		expect(board.rows.map((row) => row.id)).toEqual([
			'Bob',
			'Alice',
			EMPTY_GROUP_ID,
			'New owner',
		]);
		expect(board.items['New status']?.['New owner']).toHaveLength(1);
	});

	it('keeps a default column so an empty board can create its first note', () => {
		Services.settings = { columnColors: {} };
		const data = { data: [] } as unknown as BasesQueryResult;
		const config = {
			getOrder: vi.fn(() => []),
			getSort: vi.fn(() => []),
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
			getSort: vi.fn(() => []),
		} as unknown as BasesViewConfig;

		const board = new BoardViewDataBuilder(data, config).build({});

		expect(board.rows).toEqual([]);
		expect(board.items[EMPTY_GROUP_ID]?.default).toHaveLength(1);
	});

	it('labels card properties with their Bases display names', () => {
		Services.settings = { columnColors: {} };
		const data = { data: [] } as unknown as BasesQueryResult;
		const config = {
			getOrder: vi.fn(() => ['file.name', 'note.type', 'note.scientificity']),
			getDisplayName: vi.fn(
				(id: string) => ({ 'file.name': 'name', 'note.type': '🗄️ Type' })[id] ?? '🅰️',
			),
			getSort: vi.fn(() => []),
		} as unknown as BasesViewConfig;

		const board = new BoardViewDataBuilder(data, config).build({});

		expect(board.cardProperties).toEqual(['file.name', 'note.type', 'note.scientificity']);
		// A bare emoji name keeps the property key next to it
		expect(board.cardPropertyLabels).toEqual({
			'file.name': 'name',
			'note.type': '🗄️ Type',
			'note.scientificity': '🅰️ (scientificity)',
		});
	});

	it('ranks cards in Bases order and places drops by modified-time sorts', () => {
		const app = App.createConfigured__({ files: { 'b.md': '', 'a.md': '' } });
		Services.app = app.asOriginalType__();
		Services.settings = { columnColors: {} };
		const entries = ['b.md', 'a.md'].map((path) => {
			const file = app.vault.getFileByPath(path);
			if (!file) throw new Error(`Missing ${path}`);
			return BasesEntry.create__({}, file).asOriginalType__();
		});
		const build = (sort: { property: string; direction: 'ASC' | 'DESC' }[]) =>
			new BoardViewDataBuilder(
				{ data: entries } as unknown as BasesQueryResult,
				{
					getOrder: () => [],
					getSort: () => sort,
				} as unknown as BasesViewConfig,
			).build({});

		const board = build([]);
		expect(board.items[EMPTY_GROUP_ID]?.default?.map((item) => [item.id, item.rank])).toEqual([
			['b.md', 0],
			['a.md', 1],
		]);
		expect(board.dropPlacement).toBe('sorted');
		expect(build([{ property: 'file.mtime', direction: 'DESC' }]).dropPlacement).toBe('first');
		expect(build([{ property: 'file.mtime', direction: 'ASC' }]).dropPlacement).toBe('last');
		expect(
			build([
				{ property: 'note.priority', direction: 'ASC' },
				{ property: 'file.mtime', direction: 'DESC' },
			]).dropPlacement,
		).toBe('sorted');
	});

	it('ranks cards by the keys after a group key when the sort starts with it', () => {
		const app = App.createConfigured__({ files: { 'z.md': '', 'x.md': '', 'y.md': '' } });
		Services.app = app.asOriginalType__();
		Services.settings = { columnColors: {} };
		// Bases order for status, then title
		const entries = [
			['z.md', 'todo', 'Zeta'],
			['x.md', 'done', 'Alpha'],
			['y.md', 'done', 'Beta'],
		].map(([path = '', status = '', title = '']) => {
			const file = app.vault.getFileByPath(path);
			if (!file) throw new Error(`Missing ${path}`);
			const entry = BasesEntry.create__({}, file);
			entry.setValue__('note.status', StringValue.create__(status).asOriginalType__());
			entry.setValue__('note.title', StringValue.create__(title).asOriginalType__());
			return entry.asOriginalType__();
		});
		const build = (sort: { property: string; direction: 'ASC' | 'DESC' }[]) =>
			new BoardViewDataBuilder(
				{ data: entries } as unknown as BasesQueryResult,
				{ getOrder: () => [], getSort: () => sort } as unknown as BasesViewConfig,
			).build({ groupProperty: 'note.status' });
		const ranks = (board: ReturnType<typeof build>) =>
			Object.fromEntries(
				Object.values(board.items)
					.flatMap((cells) => Object.values(cells).flat())
					.map((item) => [item.id, item.rank]),
			);

		// Dropped into "done", Zeta lands after Alpha and Beta
		const board = build([
			{ property: 'note.status', direction: 'ASC' },
			{ property: 'note.title', direction: 'ASC' },
		]);
		expect(ranks(board)).toEqual({ 'x.md': 0, 'y.md': 1, 'z.md': 2 });
		expect(board.dropPlacement).toBe('sorted');

		// A group key after the other keys leaves Bases order as it is
		const titleFirst = build([
			{ property: 'note.title', direction: 'DESC' },
			{ property: 'note.status', direction: 'ASC' },
		]);
		expect(ranks(titleFirst)).toEqual({ 'z.md': 0, 'x.md': 1, 'y.md': 2 });

		expect(
			build([
				{ property: 'note.status', direction: 'ASC' },
				{ property: 'file.mtime', direction: 'DESC' },
			]).dropPlacement,
		).toBe('first');
	});

	it('enables manual order only while the view sorts by the order property, ascending', () => {
		Services.settings = { columnColors: {} };
		type Sort = { property: string; direction: 'ASC' | 'DESC' }[];
		const orderProperty = (sort: Sort, option: string | null = 'note.rank') =>
			new BoardViewDataBuilder(
				{ data: [] } as unknown as BasesQueryResult,
				{ getOrder: () => [], getSort: () => sort } as unknown as BasesViewConfig,
			).build({
				groupProperty: 'note.status',
				subGroupProperty: 'note.owner',
				orderProperty: option as never,
			}).orderPropertyId;
		const asc = (property: string) => ({ property, direction: 'ASC' as const });

		expect(orderProperty([asc('note.rank'), asc('file.name')])).toBe('note.rank');
		// Group keys never order a cell, so they may come first
		expect(orderProperty([asc('note.status'), asc('note.owner'), asc('note.rank')])).toBe(
			'note.rank',
		);
		expect(orderProperty([{ property: 'note.rank', direction: 'DESC' }])).toBeNull();
		expect(orderProperty([asc('file.name')])).toBeNull();
		expect(orderProperty([asc('file.name'), asc('note.rank')])).toBeNull();
		expect(orderProperty([])).toBeNull();
		expect(orderProperty([asc('note.rank')], null)).toBeNull();

		// A hand-written order property that is not a note property cannot be written
		expect(orderProperty([asc('formula.rank')], 'formula.rank')).toBeNull();
	});
});
