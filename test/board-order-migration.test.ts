import { parseYaml, Plugin, SectionCache } from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import { describe, expect, it, vi } from 'vitest';
import { OrderMigration } from '../src/Base/OrderMigration';
import { migrateBoardCodeBlocks, migrateBoardOrders } from '../src/Views/BoardOrderMigration';

const legacy = `views:
  - type: board-view
    name: Tasks
    groupProperty: note.status
    groupOrder: [Done, Todo, "Empty Group"]
    subGroupOrder: [Alice, Bob]
`;
const migrated = legacy
	.replace('groupOrder:', 'columnOrder:')
	.replace('subGroupOrder:', 'rowOrder:');

describe('Board order source migration', () => {
	it('renames both axes without changing values, comments or another view', () => {
		const native = `  - type: kanban
    name: Native
    groupBy: {property: status, direction: ASC}
    groupOrder: [Todo, Done]
`;
		const source =
			'# groupOrder: keep this comment\r\n' + legacy.replace(/\n/g, '\r\n') + native;
		const result = migrateBoardOrders(source);
		expect(result).toBe(
			'# groupOrder: keep this comment\r\n' + migrated.replace(/\n/g, '\r\n') + native,
		);
		expect(migrateBoardOrders(result)).toBe(result);
	});

	it('keeps explicit new orders authoritative, including empty orders and native filters', () => {
		const source = legacy + '    columnOrder: []\n    rowOrder: [Bob]\n';
		expect(migrateBoardOrders(source)).toBe(source);
	});

	it('preserves native group filters while migrating the independent row order', () => {
		const source = legacy + '    groupBy: {property: owner, direction: ASC}\n';
		expect(migrateBoardOrders(source)).toBe(source.replace('subGroupOrder:', 'rowOrder:'));
		const sameProperty = legacy + '    groupBy: {property: status, direction: ASC}\n';
		expect(migrateBoardOrders(sameProperty)).toBe(
			sameProperty.replace('subGroupOrder:', 'rowOrder:'),
		);
		expect(migrateBoardOrders(legacy + '    groupBy: null\n')).toBe(
			migrated + '    groupBy: null\n',
		);
	});

	it('handles quoted and flow-style keys and aliases without rewriting their values', () => {
		const source = `values: &values [Done, Todo]
views: [{type: board-view, name: Flow, "groupOrder": *values, 'subGroupOrder': [], title: 'groupOrder'}]
`;
		expect(migrateBoardOrders(source)).toBe(
			source
				.replace('"groupOrder":', '"columnOrder":')
				.replace("'subGroupOrder':", "'rowOrder':"),
		);
	});

	it('migrates all Board views while leaving nested settings and formula text intact', () => {
		const source =
			legacy +
			`    extra: {groupOrder: [other]}
    label: "subGroupOrder"
  - type: board-view
    name: Other
    groupOrder: []
`;
		const result = migrateBoardOrders(source);
		expect(result).toBe(
			migrated +
				`    extra: {groupOrder: [other]}
    label: "subGroupOrder"
  - type: board-view
    name: Other
    columnOrder: []
`,
		);
	});

	it('leaves invalid, cyclic and non-array settings untouched', () => {
		for (const source of [
			'views: [{type: board-view, groupOrder: [',
			'views: [{type: board-view, groupOrder: unsupported}]',
			'cycle: &cycle {self: *cycle}\n' + legacy,
		]) {
			expect(migrateBoardOrders(source)).toBe(source);
		}
	});

	it('migrates base fences, including callouts and lists, but not example fences', () => {
		for (const prefix of ['', '> ', '  ']) {
			const source = ['```base', ...legacy.trimEnd().split('\n'), '```']
				.map((l) => prefix + l)
				.join('\n');
			const expected = ['```base', ...migrated.trimEnd().split('\n'), '```']
				.map((l) => prefix + l)
				.join('\n');
			expect(migrateBoardCodeBlocks(source)).toBe(expected);
			expect(migrateBoardCodeBlocks('````markdown\n' + source + '\n````')).toBe(
				'````markdown\n' + source + '\n````',
			);
		}
	});

	it('keeps surrounding Markdown unchanged', () => {
		const block = '```base\n' + legacy + '```';
		const source = 'Before\n\n' + block + '\n\nAfter\n';
		expect(migrateBoardCodeBlocks(source)).toBe(
			'Before\n\n```base\n' + migrated + '```\n\nAfter\n',
		);
	});

	it('migrates fences starting on a list marker, including ordered and quoted lists', () => {
		for (const marker of ['- ', '1. ', '> - ', '- - ']) {
			const prefix = marker.replace(/[^>]/g, ' ');
			const wrap = (yaml: string) =>
				marker +
				'```base\n' +
				yaml
					.trimEnd()
					.split('\n')
					.map((line) => prefix + line)
					.join('\n') +
				'\n' +
				prefix +
				'```';
			expect(migrateBoardCodeBlocks(wrap(legacy))).toBe(wrap(migrated));
		}
	});

	it('distinguishes list continuation fences from indented examples', () => {
		for (const quote of ['', '> ']) {
			const wrap = (indent: number, yaml: string) =>
				quote +
				'- Example\n' +
				quote.trimEnd() +
				'\n' +
				['```base', ...yaml.trimEnd().split('\n'), '```']
					.map((line) => quote + ' '.repeat(indent) + line)
					.join('\n');
			expect(migrateBoardCodeBlocks(wrap(2, legacy))).toBe(wrap(2, migrated));
			expect(migrateBoardCodeBlocks(wrap(6, legacy))).toBe(wrap(6, legacy));
		}
	});

	it('never treats an indented Markdown code example as an active base', () => {
		const source = ['```base', ...legacy.trimEnd().split('\n'), '```']
			.map((l) => '    ' + l)
			.join('\n');
		expect(migrateBoardCodeBlocks(source)).toBe(source);
	});

	it('keeps HTML examples unchanged while migrating the next live base', () => {
		const block = '```base\n' + legacy + '```';
		for (const [start, end] of [
			['<!--', '-->'],
			['<div>', '</div>'],
			['<pre>', '</pre>'],
		]) {
			const wrapper = start + '\n' + block + '\n' + end + '\n\n';
			expect(migrateBoardCodeBlocks(wrapper + block)).toBe(
				wrapper + '```base\n' + migrated + '```',
			);
		}
	});

	it('does not interpret a frontmatter scalar as a base block', () => {
		const block = '```base\n' + legacy + '```';
		const frontmatter =
			'---\nexample: |\n' +
			block
				.split('\n')
				.map((line) => '  ' + line)
				.join('\n') +
			'\n---\n\n';
		expect(migrateBoardCodeBlocks(frontmatter + block)).toBe(
			frontmatter + '```base\n' + migrated + '```',
		);
	});

	it('skips Obsidian comments without treating percent signs inside code as comments', () => {
		const block = '```base\n' + legacy + '```';
		const comment = '%%\n' + block + '\n%%\n\n';
		const literal = '```text\n%%\n```\n\nInline `%%`\n\n';
		const real = '```base\n' + legacy + '    label: "%%"\n```';
		expect(migrateBoardCodeBlocks(comment + literal + real)).toBe(
			comment + literal + '```base\n' + migrated + '    label: "%%"\n```',
		);
	});

	it('preserves quoted blank lines and CRLF while mapping container code text', () => {
		const wrap = (yaml: string) =>
			'> [!info]\r\n> ```base\r\n>\r\n' +
			yaml
				.trimEnd()
				.split('\n')
				.map((line) => '> ' + line)
				.join('\r\n') +
			'\r\n> ```\r\n';
		expect(migrateBoardCodeBlocks(wrap(legacy))).toBe(wrap(migrated));
	});
});

describe('Board order migration lifecycle', () => {
	it('migrates an existing Markdown base after layout is ready without requiring an edit', async () => {
		const block = '```base\n' + legacy + '```';
		const app = App.createConfigured__({ files: { 'Tasks.md': block } });
		const plugin = {
			app: app.asOriginalType__(),
			register: vi.fn(),
			registerEvent: vi.fn(),
		} as unknown as Plugin;
		const file = app.vault.getFileByPath('Tasks.md')!;
		await new OrderMigration(plugin).start();
		app.workspace.setLayoutReady__();
		await vi.waitFor(async () =>
			expect(await app.vault.adapter.read(file.path)).toBe('```base\n' + migrated + '```'),
		);
	});

	it('ignores stale cache offsets when Markdown is now an example or frontmatter', async () => {
		const block = '```base\n' + legacy + '```';
		const examples = [
			'````md\n\n' + block + '\n````',
			'<!--\n\n\n' + block + '\n-->',
			'---\nexample: |\n' +
				block
					.split('\n')
					.map((line) => '  ' + line)
					.join('\n') +
				'\n---',
		];
		for (const current of examples) {
			const app = App.createConfigured__({ files: { 'Tasks.md': current } });
			const plugin = {
				app: app.asOriginalType__(),
				register: vi.fn(),
				registerEvent: vi.fn(),
			} as unknown as Plugin;
			await new OrderMigration(plugin).start();
			vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue({
				sections: [
					{
						type: 'code',
						position: { start: { offset: 8 }, end: { offset: 8 + block.length } },
					},
				] as SectionCache[],
			});
			const read = vi.spyOn(app.vault, 'read');
			const process = vi.spyOn(app.vault, 'process');
			app.workspace.setLayoutReady__();
			await vi.waitFor(async () => {
				expect(read).toHaveBeenCalled();
				expect(await read.mock.results[0]!.value).toBe(current);
				expect(process).not.toHaveBeenCalled();
			});
		}
	});

	it('retries a Markdown edit received while an older source is being migrated', async () => {
		const block = '```base\n' + legacy + '```';
		const app = App.createConfigured__({ files: { 'Tasks.md': block } });
		const plugin = {
			app: app.asOriginalType__(),
			register: vi.fn(),
			registerEvent: vi.fn(),
		} as unknown as Plugin;
		await new OrderMigration(plugin).start();
		let releaseRead!: (source: string) => void;
		const firstRead = new Promise<string>((resolve) => {
			releaseRead = resolve;
		});
		const read = vi.spyOn(app.vault, 'read').mockImplementationOnce(() => firstRead);
		app.workspace.setLayoutReady__();
		await vi.waitFor(() => expect(read).toHaveBeenCalled());
		const file = app.vault.getFileByPath('Tasks.md')!;
		const indexed = new Promise<void>((resolve) => {
			app.metadataCache.on('changed', () => resolve());
		});
		await app.vault.modify(file, block.replace('name: Tasks', 'name: Incoming'));
		await indexed;
		releaseRead(block);
		await vi.waitFor(async () =>
			expect(await app.vault.adapter.read(file.path)).toBe(
				'```base\n' + migrated.replace('name: Tasks', 'name: Incoming') + '```',
			),
		);
	});

	it('migrates existing and incoming bases, writes once and stops on unload', async () => {
		const app = App.createConfigured__({ files: { 'Tasks.base': legacy } });
		const cleanup: (() => void)[] = [];
		const plugin = {
			app: app.asOriginalType__(),
			register: (callback: () => void) => cleanup.push(callback),
			registerEvent: vi.fn(),
		} as unknown as Plugin;
		const process = vi.spyOn(app.vault, 'process');
		await new OrderMigration(plugin).start();
		const file = app.vault.getFileByPath('Tasks.base')!;
		expect(await app.vault.read(file)).toBe(migrated);
		expect(process).toHaveBeenCalledTimes(1);
		const incoming = await app.vault.create('Incoming.base', legacy);
		await vi.waitFor(async () => expect(await app.vault.read(incoming)).toBe(migrated));
		expect(process).toHaveBeenCalledTimes(2);
		cleanup.forEach((callback) => callback());
		const afterUnload = await app.vault.create('After.base', legacy);
		expect(await app.vault.read(afterUnload)).toBe(legacy);
	});

	it('keeps the semantic change confined to the renamed keys', () => {
		expect(parseYaml(migrateBoardOrders(legacy))).toEqual(parseYaml(migrated));
	});
});
