import { setTooltip } from 'obsidian';
import { App, BasesEntry, Value } from 'obsidian-test-mocks/obsidian';
import { describe, expect, it, vi } from 'vitest';
import Services from '../src/Base/Services';
import type { PropertyManager } from '../src/Data/PropertyManager';
import { CardView } from '../src/Views/CardView';

vi.mock('obsidian', async (importOriginal) => ({
	...(await importOriginal<typeof import('obsidian')>()),
	setTooltip: vi.fn(),
}));

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

	it('names each property in a tooltip without hiding the property key', () => {
		const app = App.createConfigured__({ files: { 'tasks/OHS-184.md': '' } });
		Services.app = app.asOriginalType__();
		const file = app.vault.getFileByPath('tasks/OHS-184.md');
		expect(file).not.toBeNull();
		if (!file) return;

		const entry = BasesEntry.create__({}, file);
		entry.setValue__('file.name', new TextValue('OHS-184').asOriginalType__());
		entry.setValue__('formula.type', new TextValue('book').asOriginalType__());
		entry.setValue__('formula.scientificity', new TextValue('📢').asOriginalType__());
		const card = new CardView({
			options: {},
			properties: ['formula.type', 'formula.scientificity'],
			propertyLabels: {
				'formula.type': '🗄️ type',
				'formula.scientificity': '🅰️ (scientificity)',
			},
		}).render(entry.asOriginalType__());

		const tooltips = vi
			.mocked(setTooltip)
			.mock.calls.map(([el, text]) => [el.textContent, text]);
		expect(tooltips).toEqual([
			['book', '🗄️ type'],
			['📢', '🅰️ (scientificity)'],
		]);
		expect(card.querySelector('.board-card-open')?.textContent).toBe('OHS-184');
	});

	it('edits a note value on click and shows the value again when left unchanged', async () => {
		const app = App.createConfigured__({ files: { 'tasks/OHS-185.md': '' } });
		let widgetContext: { onChange: (value: unknown) => void } | undefined;
		const render = vi.fn(
			(el: HTMLElement, _value: unknown, ctx: { onChange: (value: unknown) => void }) => {
				widgetContext = ctx;
				el.createDiv({
					cls: 'metadata-input-longtext',
					attr: { contenteditable: 'true', tabindex: '0' },
					text: 'todo',
				});
			},
		);
		const widget = { validate: () => true, render };
		Services.app = Object.assign(app.asOriginalType__(), {
			metadataTypeManager: { getTypeInfo: () => ({ expected: widget, inferred: widget }) },
		});
		Services.propertyManager = {
			updateFrontmatter: vi.fn(() => Promise.resolve()),
		} as unknown as PropertyManager;
		const file = app.vault.getFileByPath('tasks/OHS-185.md');
		if (!file) throw new Error('Missing test note');

		const entry = BasesEntry.create__({}, file);
		entry.setValue__('file.name', new TextValue('OHS-185').asOriginalType__());
		entry.setValue__('note.status', new TextValue('todo').asOriginalType__());
		entry.setValue__('formula.type', new TextValue('book').asOriginalType__());
		const card = new CardView({
			options: {},
			properties: ['note.status', 'formula.type'],
		}).render(entry.asOriginalType__());
		document.body.appendChild(card);
		const [status, type] = Array.from(card.querySelectorAll<HTMLElement>('.card-prop')).slice(
			1,
		);
		if (!status || !type) throw new Error('Expected two property rows');
		const field = () => status.querySelector<HTMLElement>('[contenteditable="true"]');
		const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));

		expect(render).not.toHaveBeenCalled();
		expect(status.tabIndex).toBe(0);

		status.click();
		expect(document.activeElement).toBe(field());
		field()?.blur();
		await settle();
		expect(field()).toBeNull();
		expect(status.textContent).toBe('todo');

		// A saved value keeps its editor until the board renders the new data
		status.click();
		widgetContext?.onChange('done');
		field()?.blur();
		await settle();
		expect(field()).not.toBeNull();

		type.click();
		expect(type.querySelector('[contenteditable="true"]')).toBeNull();
		card.remove();
	});

	it('edits a value that the widget first shows as a link', () => {
		const { card, status } = renderStatusCard((el) => {
			const link = el.createDiv({ cls: 'metadata-link', text: 'Sprint' });
			// Obsidian's text widget only creates its field when asked to focus
			return {
				focus: () => {
					const field = createDiv({
						attr: { contenteditable: 'true', tabindex: '0' },
						text: '[[Sprint]]',
					});
					link.replaceWith(field);
					field.focus();
				},
			};
		});

		status.click();
		expect(document.activeElement?.textContent).toBe('[[Sprint]]');
		expect(status.contains(document.activeElement)).toBe(true);
		card.remove();
	});

	it('ends the edit when the widget rebuilds its field on blur', async () => {
		const { card, status } = renderStatusCard((el) => {
			const field = el.createDiv({ attr: { contenteditable: 'true', tabindex: '0' } });
			// Obsidian's text widget shows a link value again, so focusout never bubbles
			field.addEventListener('blur', () => field.replaceWith(createDiv('metadata-link')));
		});

		status.click();
		status.querySelector<HTMLElement>('[contenteditable="true"]')?.blur();
		await settle();
		expect(status.classList.contains('board-card-property-editor')).toBe(false);
		expect(status.textContent).toBe('todo');
		card.remove();
	});

	it('keeps keyboard focus on the row when Enter or Escape ends the edit', async () => {
		let context: WidgetContext | undefined;
		const { card, status } = renderStatusCard((el, _value, ctx) => {
			context = ctx;
			el.createDiv({ attr: { contenteditable: 'true', tabindex: '0' }, text: 'todo' });
		});

		status.click();
		context?.blur();
		await settle();
		expect(document.activeElement).toBe(status);
		expect(status.querySelector('[contenteditable="true"]')).toBeNull();
		expect(status.textContent).toBe('todo');
		card.remove();
	});

	it('reopens the editor with Enter on a row that kept focus', async () => {
		let context: WidgetContext | undefined;
		const { card, status } = renderStatusCard((el, _value, ctx) => {
			context = ctx;
			el.createDiv({ attr: { contenteditable: 'true', tabindex: '0' }, text: 'todo' });
		});

		status.click();
		context?.blur();
		await settle();
		expect(document.activeElement).toBe(status);

		const enter = new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true,
		});
		status.dispatchEvent(enter);
		expect(enter.defaultPrevented).toBe(true);
		expect(document.activeElement?.getAttribute('contenteditable')).toBe('true');
		expect(status.contains(document.activeElement)).toBe(true);
		card.remove();
	});

	it('puts back the list the note kept when saving fails', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const values: unknown[] = [];
		let context: WidgetContext | undefined;
		const { card } = renderStatusCard(
			(el, value, ctx) => {
				values.push(value);
				context = ctx;
				el.createDiv('multi-select-container');
			},
			vi.fn(() => Promise.reject(new Error('Malformed YAML'))),
			'multitext',
		);

		expect(values).toEqual([null]);
		context?.onChange(['draft']);
		await vi.waitFor(() => expect(values).toEqual([null, null]));
		logged.mockRestore();
		card.remove();
	});

	it('shows the note value again when saving fails', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let context: WidgetContext | undefined;
		const { card, status } = renderStatusCard(
			(el, _value, ctx) => {
				context = ctx;
				el.createDiv({ attr: { contenteditable: 'true', tabindex: '0' }, text: 'todo' });
			},
			vi.fn(() => Promise.reject(new Error('Malformed YAML'))),
		);

		status.click();
		context?.onChange('done');
		status.querySelector<HTMLElement>('[contenteditable="true"]')?.blur();
		await vi.waitFor(() => expect(status.querySelector('[contenteditable="true"]')).toBeNull());
		expect(status.textContent).toBe('todo');
		logged.mockRestore();
		card.remove();
	});

	it('leaves the context menu to a pill that opens its own', () => {
		const { card, status } = renderStatusCard((el) => el.createDiv('multi-select-pill'));
		const trigger = vi.spyOn(Services.app.workspace, 'trigger');
		const pill = status.createDiv('multi-select-pill');
		pill.addEventListener('contextmenu', (evt) => evt.preventDefault());
		const contextMenu = (target: HTMLElement) =>
			target.dispatchEvent(
				new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
			);

		contextMenu(pill);
		expect(trigger).not.toHaveBeenCalled();
		contextMenu(status);
		expect(trigger).toHaveBeenCalledWith(
			'file-menu',
			expect.anything(),
			expect.anything(),
			'board-card',
		);
		card.remove();
	});
});

interface WidgetContext {
	blur(): void;
	onChange(value: unknown): void;
}

function settle(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

// A card with one note property, `status`, edited by the given widget
function renderStatusCard(
	render: (el: HTMLElement, value: unknown, ctx: WidgetContext) => unknown,
	updateFrontmatter = vi.fn(() => Promise.resolve()),
	type?: string,
): { card: HTMLElement; status: HTMLElement } {
	const app = App.createConfigured__({ files: { 'tasks/OHS-186.md': '' } });
	const widget = { type, render };
	Services.app = Object.assign(app.asOriginalType__(), {
		metadataTypeManager: { getTypeInfo: () => ({ inferred: widget }) },
	});
	Services.propertyManager = { updateFrontmatter } as unknown as PropertyManager;
	const file = app.vault.getFileByPath('tasks/OHS-186.md');
	if (!file) throw new Error('Missing test note');
	const entry = BasesEntry.create__({}, file);
	entry.setValue__('file.name', new TextValue('OHS-186').asOriginalType__());
	entry.setValue__('note.status', new TextValue('todo').asOriginalType__());
	const card = new CardView({ options: {}, properties: ['note.status'] }).render(
		entry.asOriginalType__(),
	);
	document.body.appendChild(card);
	const status = card.querySelector<HTMLElement>('[data-board-property="note.status"]');
	if (!status) throw new Error('Expected a status row');
	return { card, status };
}
