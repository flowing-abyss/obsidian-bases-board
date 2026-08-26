import { App } from 'obsidian-test-mocks/obsidian';
import { describe, expect, it, vi } from 'vitest';
import Services from '../src/Base/Services';
import { PropertyManager } from '../src/Data/PropertyManager';

describe('PropertyManager', () => {
	it('updates all moved-card properties in one frontmatter transaction', async () => {
		const app = App.createConfigured__({ files: { 'tasks/OHS-180.md': '' } });
		Services.app = app.asOriginalType__();
		const file = app.vault.getFileByPath('tasks/OHS-180.md');
		expect(file).not.toBeNull();
		if (!file) return;

		const frontmatter: Record<string, unknown> = {};
		const processFrontMatter = vi
			.spyOn(app.fileManager, 'processFrontMatter')
			.mockImplementation((_file, processor) => {
				processor(frontmatter);
				return Promise.resolve();
			});

		await new PropertyManager().updateFrontmatterValues(file.asOriginalType2__(), {
			status: 'todo',
			priority: 'high',
		});

		expect(processFrontMatter).toHaveBeenCalledTimes(1);
		expect(frontmatter).toEqual({ status: 'todo', priority: 'high' });
	});
});
