import { App, BasesEntry, Value } from 'obsidian-test-mocks/obsidian';
import { describe, expect, it, vi } from 'vitest';
import Services from '../src/Base/Services';
import { CardView } from '../src/Views/CardView';

class TextValue extends Value {
	constructor(private readonly text: string) {
		super();
	}

	override isTruthy(): boolean {
		return this.text.length > 0;
	}

	override toString(): string {
		return this.text;
	}
}

describe('CardView navigation', () => {
	it('keeps drag and title navigation distinct inside an embedded Base', async () => {
		const app = App.createConfigured__({ files: { 'tasks/OHS-180.md': '' } });
		Services.app = app.asOriginalType__();
		const file = app.vault.getFileByPath('tasks/OHS-180.md');
		expect(file).not.toBeNull();
		if (!file) return;

		const entry = BasesEntry.create__({}, file);
		entry.setValue__('file.name', new TextValue('OHS-180').asOriginalType__());
		const card = new CardView({ options: {}, properties: [] }).render(entry.asOriginalType__());
		const embeddedBase = document.body.createDiv();
		embeddedBase.dataset.href = 'tasks.base';
		embeddedBase.appendChild(card);
		const getLeaf = vi.spyOn(app.workspace, 'getLeaf');

		const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
		expect(card.dispatchEvent(dragStart)).toBe(true);
		expect(dragStart.defaultPrevented).toBe(false);
		card.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
		expect(getLeaf).not.toHaveBeenCalled();

		const title = card.querySelector<HTMLElement>('.board-card-open');
		title?.click();
		await vi.waitFor(() => expect(app.workspace.getActiveFile()?.path).toBe(file.path));
		expect(getLeaf).toHaveBeenCalledWith('tab');
	});

	it('does not turn the whole card into a navigation target', () => {
		const app = App.createConfigured__({ files: { 'tasks/OHS-181.md': '' } });
		Services.app = app.asOriginalType__();
		const file = app.vault.getFileByPath('tasks/OHS-181.md');
		expect(file).not.toBeNull();
		if (!file) return;

		const getLeaf = vi.spyOn(app.workspace, 'getLeaf');
		const entry = BasesEntry.create__({}, file);
		entry.setValue__('file.name', new TextValue('OHS-181').asOriginalType__());
		const card = new CardView({ options: {}, properties: [] }).render(entry.asOriginalType__());

		expect(card.getAttribute('role')).toBeNull();
		expect(card.getAttribute('tabindex')).toBeNull();
		card.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
		card.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

		expect(getLeaf).not.toHaveBeenCalled();
	});

	it('supports keyboard opening from the title without adding a drag handle', async () => {
		const app = App.createConfigured__({ files: { 'tasks/OHS-182.md': '' } });
		Services.app = app.asOriginalType__();
		const file = app.vault.getFileByPath('tasks/OHS-182.md');
		expect(file).not.toBeNull();
		if (!file) return;

		const entry = BasesEntry.create__({}, file);
		entry.setValue__('file.name', new TextValue('OHS-182').asOriginalType__());
		const card = new CardView({ options: {}, properties: [] }).render(entry.asOriginalType__());

		expect(card.querySelector('.board-drag-handle')).toBeNull();
		const title = card.querySelector<HTMLElement>('.board-card-open');
		expect(title?.getAttribute('role')).toBe('link');
		expect(title?.getAttribute('tabindex')).toBe('0');
		title?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

		await vi.waitFor(() => {
			expect(app.workspace.getActiveFile()?.path).toBe(file.path);
		});
	});

	it('opens from the title in a new tab', async () => {
		const app = App.createConfigured__({ files: { 'tasks/OHS-183.md': '' } });
		Services.app = app.asOriginalType__();
		const file = app.vault.getFileByPath('tasks/OHS-183.md');
		expect(file).not.toBeNull();
		if (!file) return;
		const getLeaf = vi.spyOn(app.workspace, 'getLeaf');

		const entry = BasesEntry.create__({}, file);
		entry.setValue__('file.name', new TextValue('OHS-183').asOriginalType__());
		const card = new CardView({ options: {}, properties: [] }).render(entry.asOriginalType__());
		const title = card.querySelector<HTMLElement>('.board-card-open');
		expect(title).not.toBeNull();
		if (!title) return;

		title.click();

		await vi.waitFor(() => {
			expect(app.workspace.getActiveFile()?.path).toBe(file.path);
		});
		expect(getLeaf).toHaveBeenCalledWith('tab');
	});
});
