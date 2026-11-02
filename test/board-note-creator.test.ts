import { App } from 'obsidian-test-mocks/obsidian';
import { describe, expect, it, vi } from 'vitest';
import Services from '../src/Base/Services';
import { EMPTY_GROUP_ID } from '../src/Views/BoardConstants';
import { BoardNoteCreator } from '../src/Views/BoardNoteCreator';

const TEMPLATE_PATH = 'templates/task.md';
const TARGET_PATH = 'base/tasks/Untitled.md';

describe('BoardNoteCreator template sequencing', () => {
	it('waits for Templater before assigning board properties', async () => {
		const template = [
			'<% "---" %>',
			'tags:',
			'  - task/default',
			'id: <% "OHS-197" %>',
			'status: 📥',
			'priority: ◽',
			'<% "---" %>',
			'',
		].join('\n');
		const app = App.createConfigured__({
			files: { [TEMPLATE_PATH]: template, 'base/tasks/existing.md': '' },
		});
		Services.app = app.asOriginalType__();

		app.vault.on('create', (...data: unknown[]) => {
			const createdFile = data[0];
			if (!createdFile || typeof createdFile !== 'object' || !('path' in createdFile)) return;
			if (createdFile.path !== TARGET_PATH) return;
			window.setTimeout(() => {
				const file = app.vault.getFileByPath(TARGET_PATH);
				if (!file) return;
				void app.vault
					.read(file)
					.then((content) =>
						app.vault.modify(
							file,
							content
								.replace(/<% "---" %>/g, '---')
								.replace('<% "OHS-197" %>', 'OHS-197'),
						),
					);
			}, 10);
		});

		await new BoardNoteCreator().handleNewNoteClick('❄', '🔺', 'note.status', 'note.priority', {
			newNoteFolder: 'base/tasks',
			newNoteTemplate: TEMPLATE_PATH,
		});

		const file = app.vault.getFileByPath(TARGET_PATH);
		expect(file).not.toBeNull();
		if (!file) return;
		const content = await app.vault.read(file);

		expect(content.match(/^---$/gm)).toHaveLength(2);
		expect(content).not.toContain('<%');
		expect(content).toContain('id: OHS-197');
		expect(content).toContain('status: ❄');
		expect(content).toContain('priority: 🔺');
		expect(content).not.toContain('status: 📥');
		expect(content).not.toContain('priority: ◽');
	});

	it('does not write computed or file properties during native note creation', async () => {
		const frontmatter: Record<string, unknown> = {};
		await new BoardNoteCreator().handleNewNoteClick(
			'computed',
			'filename',
			'formula.status',
			'file.name',
			{},
			(processor) => {
				processor(frontmatter);
				return Promise.resolve();
			},
		);

		expect(frontmatter).toEqual({});
	});

	it('does not silently fall back to the vault root for an invalid folder', async () => {
		const app = App.createConfigured__({ files: {} });
		Services.app = app.asOriginalType__();
		const create = vi.spyOn(app.vault, 'create');

		await new BoardNoteCreator().handleNewNoteClick('todo', undefined, 'note.status', null, {
			newNoteFolder: 'missing/folder',
		});

		expect(create).not.toHaveBeenCalled();
	});

	it('does not create a blank note when an explicit template is missing', async () => {
		const app = App.createConfigured__({ files: { 'tasks/existing.md': '' } });
		Services.app = app.asOriginalType__();
		const create = vi.spyOn(app.vault, 'create');

		await new BoardNoteCreator().handleNewNoteClick('todo', undefined, 'note.status', null, {
			newNoteFolder: 'tasks',
			newNoteTemplate: 'templates/missing.md',
		});

		expect(create).not.toHaveBeenCalled();
	});
});

describe('BoardNoteCreator QuickAdd integration', () => {
	it('runs the configured choice with the selected cell values and creates no blank note', async () => {
		const app = App.createConfigured__({ files: { 'tasks/existing.md': '' } });
		const executeChoice = vi.fn().mockResolvedValue(undefined);
		Services.app = Object.assign(app.asOriginalType__(), {
			plugins: {
				getPlugin: (id: string) => (id === 'quickadd' ? { api: { executeChoice } } : null),
			},
		});
		const create = vi.spyOn(app.vault, 'create');
		const createFileForView = vi.fn();

		await new BoardNoteCreator().handleNewNoteClick(
			'High',
			'En cours',
			'note.Priority',
			'note.Statut',
			{ newNoteQuickAddChoice: 'Ajouter un jeu', newNoteFolder: 'tasks' },
			createFileForView,
		);

		expect(executeChoice).toHaveBeenCalledWith('Ajouter un jeu', {
			Priority: 'High',
			Statut: 'En cours',
		});
		expect(create).not.toHaveBeenCalled();
		expect(createFileForView).not.toHaveBeenCalled();
	});

	it('does not pass empty groups or calculated properties to QuickAdd', async () => {
		const app = App.createConfigured__({ files: {} });
		const executeChoice = vi.fn().mockResolvedValue(undefined);
		Services.app = Object.assign(app.asOriginalType__(), {
			plugins: { getPlugin: () => ({ api: { executeChoice } }) },
		});

		await new BoardNoteCreator().handleNewNoteClick(
			EMPTY_GROUP_ID,
			'calculated',
			'note.status',
			'formula.priority',
			{ newNoteQuickAddChoice: 'Create' },
		);

		expect(executeChoice).toHaveBeenCalledWith('Create', {});
	});

	it('does not fall back to creating an empty file when QuickAdd is unavailable', async () => {
		const app = App.createConfigured__({ files: { 'tasks/existing.md': '' } });
		Services.app = Object.assign(app.asOriginalType__(), {
			plugins: { getPlugin: () => null },
		});
		const create = vi.spyOn(app.vault, 'create');
		const createFileForView = vi.fn();

		await new BoardNoteCreator().handleNewNoteClick(
			'todo',
			undefined,
			'note.status',
			null,
			{ newNoteQuickAddChoice: 'Create', newNoteFolder: 'tasks' },
			createFileForView,
		);

		expect(create).not.toHaveBeenCalled();
		expect(createFileForView).not.toHaveBeenCalled();
	});

	it.each(['Input cancelled by user', 'One-page input cancelled by user'])(
		'treats dismissing the QuickAdd form as cancellation: %s',
		async (message) => {
			const app = App.createConfigured__({ files: {} });
			const cancellation = new Error(message);
			cancellation.name = 'MacroAbortError';
			const executeChoice = vi.fn().mockRejectedValue(cancellation);
			Services.app = Object.assign(app.asOriginalType__(), {
				plugins: { getPlugin: () => ({ api: { executeChoice } }) },
			});
			const log = vi.spyOn(console, 'error');

			await new BoardNoteCreator().handleNewNoteClick(
				'todo',
				undefined,
				'note.status',
				null,
				{
					newNoteQuickAddChoice: 'Create',
				},
			);

			expect(log).not.toHaveBeenCalled();
			log.mockRestore();
		},
	);
});
