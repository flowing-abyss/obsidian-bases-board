import { BasesViewConfig, QueryController } from 'obsidian';

interface NativeMenus {
	groupMenu?: { toolbarItem?: { containerEl?: HTMLElement } };
	displayMenu?: { toolbarItem?: { menu?: { menuEl?: HTMLElement } } };
}

/** Keep native grouping accessible when it is already configured for this view. */
export class NativeGroupMenu {
	private elements: HTMLElement[] = [];

	constructor(controller: QueryController) {
		// These optional toolbar handles aren't part of the public Bases API.
		// Older hosts (and hosts with changed internals) simply keep their menus.
		if (!('groupMenu' in controller)) return;
		const menus = controller as unknown as NativeMenus;
		for (const element of [
			menus.groupMenu?.toolbarItem?.containerEl,
			menus.displayMenu?.toolbarItem?.menu?.menuEl,
		]) {
			if (element?.classList) this.elements.push(element);
		}
	}

	update(config: BasesViewConfig): void {
		const active = 'groupBy' in config && Boolean(config.groupBy);
		for (const element of this.elements) {
			element.classList.toggle('board-hide-native-group', !active);
		}
	}

	destroy(): void {
		for (const element of this.elements) element.classList.remove('board-hide-native-group');
	}
}
