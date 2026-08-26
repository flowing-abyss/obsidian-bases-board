import { App } from 'obsidian-test-mocks/obsidian';
import { describe, expect, it, vi } from 'vitest';
import Services from '../src/Base/Services';
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
