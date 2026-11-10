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
import { writeManualOrderDrop } from '../src/Views/ManualOrderWriter';

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

describe('writeManualOrderDrop', () => {
	beforeEach(() => {
		notices.length = 0;
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

		await writeManualOrderDrop('a.md', { status: 'done' }, drop);

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

		await writeManualOrderDrop(
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

		await writeManualOrderDrop(
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
			writeManualOrderDrop(
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
			writeManualOrderDrop(
				'c.md',
				{},
				{ propertyId: 'note.order', targetIds: ['c.md', 'a.md', 'b.md'], sourceIds: null },
			),
		).rejects.toThrow('Failed to renumber 1 card(s)');

		expect(notes).toEqual({ 'a.md': { order: 2 }, 'b.md': { order: 2 }, 'c.md': { order: 1 } });
		expect(error).toHaveBeenCalledWith(expect.any(String), ['b.md'], expect.any(Array));
	});
});
