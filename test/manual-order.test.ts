import { describe, expect, it } from 'vitest';
import {
	assertReplaceableOrderValue,
	collectCellOrder,
	computeCellOrder,
	isReplaceableOrderValue,
	ManualOrderDrop,
	planManualOrderDrop,
} from '../src/Views/ManualOrder';

const reader = (values: Record<string, unknown>) => (id: string) => values[id];

describe('computeCellOrder', () => {
	it('moving a card up rewrites only the cards it shifted', () => {
		// e (5th) dropped in 2nd place
		const updates = computeCellOrder(
			['a', 'e', 'b', 'c', 'd'],
			reader({ a: 1, b: 2, c: 3, d: 4, e: 5 }),
		);
		expect([...updates]).toEqual([
			['e', 2],
			['b', 3],
			['c', 4],
			['d', 5],
		]);
	});

	it('moving a card down rewrites only the cards it shifted', () => {
		// a (1st) dropped in 3rd place
		const updates = computeCellOrder(['b', 'c', 'a', 'd'], reader({ a: 1, b: 2, c: 3, d: 4 }));
		expect([...updates]).toEqual([
			['b', 1],
			['c', 2],
			['a', 3],
		]);
	});

	it('numbers a whole cell on its first drop', () => {
		expect([...computeCellOrder(['b', 'a', 'c'], reader({}))]).toEqual([
			['b', 1],
			['a', 2],
			['c', 3],
		]);
	});

	it('writes nothing when every card already has its position', () => {
		expect(computeCellOrder(['a', 'b'], reader({ a: 1, b: 2 })).size).toBe(0);
	});
});

describe('planManualOrderDrop', () => {
	const sameCell = (targetIds: string[]): ManualOrderDrop => ({
		propertyId: 'note.order',
		targetIds,
		sourceIds: null,
	});

	it('reorders within a cell without writing group values', () => {
		const plan = planManualOrderDrop(
			'c',
			{},
			sameCell(['c', 'a', 'b']),
			'order',
			reader({ a: 1, b: 2, c: 3 }),
		);
		expect(plan).toEqual({
			ok: true,
			dragged: { path: 'c', values: { order: 1 } },
			others: [
				{ path: 'a', values: { order: 2 } },
				{ path: 'b', values: { order: 3 } },
			],
		});
	});

	it('writes group values and order of the moved card together and closes the source', () => {
		const plan = planManualOrderDrop(
			'b',
			{ status: 'done', owner: 'Bob' },
			{ propertyId: 'note.order', targetIds: ['x', 'b', 'y'], sourceIds: ['a', 'c'] },
			'order',
			reader({ a: 1, b: 5, c: 3, x: 1, y: 2 }),
		);
		expect(plan).toEqual({
			ok: true,
			dragged: { path: 'b', values: { status: 'done', owner: 'Bob', order: 2 } },
			others: [
				{ path: 'y', values: { order: 3 } },
				{ path: 'c', values: { order: 2 } },
			],
		});
	});

	it('numbers an empty target cell with the moved card alone', () => {
		const plan = planManualOrderDrop(
			'a',
			{ status: 'done' },
			{ propertyId: 'note.order', targetIds: ['a'], sourceIds: [] },
			'order',
			reader({ a: 4 }),
		);
		expect(plan).toEqual({
			ok: true,
			dragged: { path: 'a', values: { status: 'done', order: 1 } },
			others: [],
		});
	});

	it('never renumbers the moved card as part of its source cell', () => {
		const plan = planManualOrderDrop(
			'a',
			{},
			{ propertyId: 'note.order', targetIds: ['a'], sourceIds: ['a', 'b'] },
			'order',
			reader({ a: 1, b: 2 }),
		);
		expect(plan).toEqual({
			ok: true,
			dragged: null,
			others: [{ path: 'b', values: { order: 1 } }],
		});
	});

	it('writes nothing when the cell is already in that order', () => {
		expect(
			planManualOrderDrop('a', {}, sameCell(['a', 'b']), 'order', reader({ a: 1, b: 2 })),
		).toEqual({ ok: true, dragged: null, others: [] });
	});

	it.each([['text'], [['1', '2']], ['12'], [Number.NaN], [true], [{ value: 1 }]])(
		'cancels the whole drop when a card holds %j',
		(value) => {
			const plan = planManualOrderDrop(
				'a',
				{ status: 'done' },
				{ propertyId: 'note.order', targetIds: ['a', 'b'], sourceIds: ['c'] },
				'order',
				reader({ a: 1, b: 2, c: value }),
			);
			expect(plan).toEqual({ ok: false, invalidPaths: ['c'] });
		},
	);
});

describe('order values', () => {
	it('treats only absent and finite numeric values as replaceable', () => {
		expect([undefined, null, 0, 2.5, -1].every(isReplaceableOrderValue)).toBe(true);
		expect(['', '3', Infinity, []].some(isReplaceableOrderValue)).toBe(false);
	});

	it('refuses a write over a value typed since the drop was planned', () => {
		expect(() => assertReplaceableOrderValue({ Order: 'first' }, 'order')).toThrow();
		expect(() => assertReplaceableOrderValue({ Order: 3 }, 'order')).not.toThrow();
		expect(() => assertReplaceableOrderValue({}, 'order')).not.toThrow();
	});
});

describe('collectCellOrder', () => {
	it('reads card ids in board order and skips the copy a cloned drag leaves behind', () => {
		const card = (id: string) => createDiv({ cls: 'board-card', attr: { 'data-item-id': id } });
		const source = createDiv('board-cell');
		const target = createDiv('board-cell');
		const dragged = card('b');
		source.append(card('a'), card('b'), card('c'));
		source.createEl('button', { cls: 'board-new-note-button' });
		target.append(card('x'), dragged);
		target.createEl('button', { cls: 'board-new-note-button' });

		expect(collectCellOrder(source, dragged)).toEqual(['a', 'c']);
		expect(collectCellOrder(target, dragged)).toEqual(['x', 'b']);
	});
});
