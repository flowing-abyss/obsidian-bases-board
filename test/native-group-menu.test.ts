import { BasesViewConfig, QueryController } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { NativeGroupMenu } from '../src/Views/NativeGroupMenu';
import '../styles.css';

describe('native Group menu in Board', () => {
	it('hides inactive desktop and mobile controls and restores them when leaving Board', () => {
		const button = document.body.createDiv('bases-toolbar-group-menu');
		const popup = document.body.createDiv('bases-toolbar-menu');
		const group = popup.createDiv('bases-toolbar-menu-item');
		group.createDiv('svg-icon lucide-stretch-horizontal');
		const sort = popup.createDiv('bases-toolbar-menu-item');
		sort.createDiv('svg-icon lucide-arrow-up-down');
		const menu = new NativeGroupMenu({
			groupMenu: { toolbarItem: { containerEl: button } },
			displayMenu: { toolbarItem: { menu: { menuEl: popup } } },
		} as unknown as QueryController);

		menu.update({} as BasesViewConfig);
		expect(getComputedStyle(button).display).toBe('none');
		expect(getComputedStyle(group).display).toBe('none');
		expect(getComputedStyle(sort).display).not.toBe('none');

		menu.update({ groupBy: { property: 'note.owner' } } as unknown as BasesViewConfig);
		expect(getComputedStyle(button).display).not.toBe('none');
		expect(getComputedStyle(group).display).not.toBe('none');
		menu.update({} as BasesViewConfig);
		menu.destroy();
		expect(getComputedStyle(button).display).not.toBe('none');
		expect(getComputedStyle(group).display).not.toBe('none');
		button.remove();
		popup.remove();
	});

	it('supports older hosts without a separate Group menu', () => {
		const menu = new NativeGroupMenu({} as QueryController);
		expect(() => menu.update({} as BasesViewConfig)).not.toThrow();
		menu.destroy();
	});
});
