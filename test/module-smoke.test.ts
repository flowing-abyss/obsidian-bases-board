import { App, QueryController } from 'obsidian-test-mocks/obsidian';
import { describe, expect, it } from 'vitest';
import { BoardViewRenderer } from '../src/Views/BoardViewRenderer';

describe('plugin module smoke test', () => {
	it('loads the Bases renderer through the public Obsidian mock API', () => {
		const app = App.createConfigured__({ files: {} });
		const parent = document.body.createDiv();
		const controller = QueryController.create2__(app, {}, document.body.createDiv());

		const renderer = new BoardViewRenderer(controller.asOriginalType2__(), parent);

		expect(parent.querySelector('.board-view .board-board-container')).not.toBeNull();
		renderer.unload();
		expect(parent.querySelector('.board-board-container')?.childElementCount).toBe(0);
	});
});
