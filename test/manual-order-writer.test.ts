import type { App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', async (importOriginal) => ({
	...(await importOriginal<typeof import('obsidian')>()),
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
}));

import Services from '../src/Base/Services';
import { PropertyManager } from '../src/Data/PropertyManager';
import { ManualOrderDrop } from '../src/Views/ManualOrder';
import { ManualOrderWriter } from '../src/Views/ManualOrderWriter';

type Notes = Record<string, Record<string, unknown>>;

// Notes as stored on disk, and the metadata cache the drop is planned from
function setUpVault(notes: Notes, cached: Notes = notes) {
	const processFrontMatter = vi.fn(
		(file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
			const frontmatter = structuredClone(notes[file.path] ?? {});
			fn(frontmatter);
			notes[file.path] = frontmatter;
			return Promise.resolve();
		},
	);
	Services.app = {
		vault: { getFileByPath: (path: string) => (path in notes ? { path } : null) },
		metadataCache: {
			getFileCache: (file: { path: string }) => ({ frontmatter: cached[file.path] }),
		},
		fileManager: { processFrontMatter },
	} as unknown as App;
	Services.propertyManager = new PropertyManager();
	return processFrontMatter;
}

const writtenPaths = (processFrontMatter: ReturnType<typeof setUpVault>) =>
	processFrontMatter.mock.calls.map(([file]) => file.path);

describe('ManualOrderWriter', () => {
	let writer: ManualOrderWriter;
	beforeEach(() => {
		notices.length = 0;
		writer = new ManualOrderWriter();
	});
	afterEach(() => vi.restoreAllMocks());

	it('moves a card in one write, then renumbers only the shifted cards of both cells', async () => {
		const notes: Notes = {
			'a.md': { status: 'todo', Order: 1 },
			'b.md': { status: 'todo', Order: 2 },
			'c.md': { status: 'todo', Order: 3 },
			'x.md': { status: 'done', Order: 1 },
			'y.md': { status: 'done', Order: 2 },
			'other.md': { status: 'later', Order: 7 },
		};
		const processFrontMatter = setUpVault(notes);
		const drop: ManualOrderDrop = {
			propertyId: 'note.order',
			targetIds: ['x.md', 'a.md', 'y.md'],
			sourceIds: ['b.md', 'c.md'],
		};

		await writer.write('a.md', { status: 'done' }, drop);

		expect(writtenPaths(processFrontMatter)[0]).toBe('a.md');
		expect(writtenPaths(processFrontMatter).sort((a, b) => a.localeCompare(b))).toEqual([
			'a.md',
			'b.md',
			'c.md',
			'y.md',
		]);
		expect(notes).toEqual({
			'a.md': { status: 'done', Order: 2 },
			'b.md': { status: 'todo', Order: 1 },
			'c.md': { status: 'todo', Order: 2 },
			'x.md': { status: 'done', Order: 1 },
			'y.md': { status: 'done', Order: 3 },
			'other.md': { status: 'later', Order: 7 },
		});
	});

	it('writes nothing at all when a card in a touched cell holds a non-numeric value', async () => {
		const notes: Notes = {
			'a.md': { status: 'todo', order: 1 },
			'b.md': { status: 'todo', order: '12' },
			'x.md': { status: 'done' },
		};
		const before = structuredClone(notes);
		const processFrontMatter = setUpVault(notes);
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		await writer.write(
			'a.md',
			{ status: 'done' },
			{ propertyId: 'note.order', targetIds: ['a.md', 'x.md'], sourceIds: ['b.md'] },
		);

		expect(processFrontMatter).not.toHaveBeenCalled();
		expect(notes).toEqual(before);
		expect(notices).toHaveLength(1);
	});

	it('only writes to note properties', async () => {
		const processFrontMatter = setUpVault({ 'a.md': {}, 'b.md': {} });

		await writer.write(
			'a.md',
			{},
			{ propertyId: 'formula.rank', targetIds: ['b.md', 'a.md'], sourceIds: null },
		);

		expect(processFrontMatter).not.toHaveBeenCalled();
		expect(notices).toEqual(['Order property must be a note property']);
	});

	it('leaves a moved card untouched when its value changed to text since the drop', async () => {
		const notes: Notes = { 'a.md': { status: 'todo', order: 'first' }, 'x.md': {} };
		setUpVault(notes, { 'a.md': { status: 'todo' }, 'x.md': {} });
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			writer.write(
				'a.md',
				{ status: 'done' },
				{ propertyId: 'note.order', targetIds: ['x.md', 'a.md'], sourceIds: [] },
			),
		).rejects.toThrow();

		// The renumbering of x.md waits for the moved card
		expect(notes).toEqual({ 'a.md': { status: 'todo', order: 'first' }, 'x.md': {} });
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining('moved card'),
			'a.md',
			expect.any(Error),
		);
	});

	it('logs the cards it could not renumber and reports the failure', async () => {
		const notes: Notes = { 'a.md': { order: 1 }, 'b.md': { order: 2 }, 'c.md': { order: 3 } };
		const processFrontMatter = setUpVault(notes);
		const write = processFrontMatter.getMockImplementation();
		processFrontMatter.mockImplementation((file, fn) =>
			file.path === 'b.md' ? Promise.reject(new Error('locked')) : write!(file, fn),
		);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			writer.write(
				'c.md',
				{},
				{ propertyId: 'note.order', targetIds: ['c.md', 'a.md', 'b.md'], sourceIds: null },
			),
		).rejects.toThrow('Failed to renumber 1 card(s)');

		expect(notes).toEqual({ 'a.md': { order: 2 }, 'b.md': { order: 2 }, 'c.md': { order: 1 } });
		expect(error).toHaveBeenCalledWith(expect.any(String), ['b.md'], expect.any(Array));
	});

	const reorder = (itemId: string, targetIds: string[]) =>
		writer.write(itemId, {}, { propertyId: 'note.order', targetIds, sourceIds: null });

	it('plans the next drop from the values it wrote while the cache still lags', async () => {
		const notes: Notes = { 'a.md': { order: 1 }, 'b.md': { order: 2 }, 'c.md': { order: 3 } };
		// The cache never reports the writes
		setUpVault(notes, structuredClone(notes));

		await reorder('c.md', ['c.md', 'a.md', 'b.md']);
		// The board still shows a, b, c
		await reorder('b.md', ['b.md', 'a.md', 'c.md']);

		expect(notes).toEqual({ 'a.md': { order: 2 }, 'b.md': { order: 1 }, 'c.md': { order: 3 } });
	});

	it('plans a drop only once the previous drop was written', async () => {
		const notes: Notes = { 'a.md': { order: 1 }, 'b.md': { order: 2 }, 'c.md': { order: 3 } };
		const processFrontMatter = setUpVault(notes, structuredClone(notes));
		const write = processFrontMatter.getMockImplementation()!;
		// Each write resolves on a later tick
		processFrontMatter.mockImplementation((file, fn) =>
			Promise.resolve().then(() => write(file, fn)),
		);

		await Promise.all([
			reorder('c.md', ['c.md', 'a.md', 'b.md']),
			reorder('b.md', ['b.md', 'a.md', 'c.md']),
		]);

		expect(notes).toEqual({ 'a.md': { order: 2 }, 'b.md': { order: 1 }, 'c.md': { order: 3 } });
	});

	it('plans from the cache again once it reported the written values', async () => {
		const notes: Notes = { 'a.md': { order: 1 }, 'b.md': { order: 2 }, 'c.md': { order: 3 } };
		const cached = structuredClone(notes);
		const processFrontMatter = setUpVault(notes, cached);

		await reorder('c.md', ['c.md', 'a.md', 'b.md']);
		for (const path of Object.keys(notes)) {
			cached[path] = structuredClone(notes[path]!);
			writer.onMetadataChanged(path, cached[path]);
		}
		// Edited outside the board: c.md moves to the end
		notes['c.md'] = { order: 9 };
		cached['c.md'] = { order: 9 };
		processFrontMatter.mockClear();

		await reorder('c.md', ['c.md', 'a.md', 'b.md']);

		expect(writtenPaths(processFrontMatter)).toEqual(['c.md']);
		expect(notes).toEqual({ 'a.md': { order: 2 }, 'b.md': { order: 3 }, 'c.md': { order: 1 } });
	});

	it('keeps a written value the cache reports with an older value', async () => {
		const notes: Notes = { 'a.md': { order: 1 }, 'b.md': { order: 2 } };
		const cached = structuredClone(notes);
		setUpVault(notes, cached);

		await reorder('b.md', ['b.md', 'a.md']);
		writer.onMetadataChanged('a.md', { order: 1 });
		await reorder('a.md', ['a.md', 'b.md']);

		expect(notes).toEqual({ 'a.md': { order: 1 }, 'b.md': { order: 2 } });
	});

	it('forgets a value it failed to write, and still writes the next drop', async () => {
		const notes: Notes = { 'a.md': { order: 1 }, 'b.md': { order: 2 }, 'c.md': { order: 3 } };
		const processFrontMatter = setUpVault(notes, structuredClone(notes));
		const write = processFrontMatter.getMockImplementation()!;
		processFrontMatter
			.mockImplementationOnce(write)
			.mockImplementationOnce((file, fn) =>
				file.path === 'a.md' ? Promise.reject(new Error('locked')) : write(file, fn),
			);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		// Writes c.md, then a.md fails and b.md succeeds
		await expect(reorder('c.md', ['c.md', 'a.md', 'b.md'])).rejects.toThrow(
			'Failed to renumber 1 card(s)',
		);
		processFrontMatter.mockClear();
		await reorder('b.md', ['b.md', 'a.md', 'c.md']);

		// a.md is planned from the cache (1), not from the failed write (2)
		expect(writtenPaths(processFrontMatter).sort((x, y) => x.localeCompare(y))).toEqual([
			'a.md',
			'b.md',
			'c.md',
		]);
		expect(notes).toEqual({ 'a.md': { order: 2 }, 'b.md': { order: 1 }, 'c.md': { order: 3 } });
	});
});
