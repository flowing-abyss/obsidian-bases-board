import { describe, expect, it } from 'vitest';
import '../styles.css';

describe('board drag preview layout', () => {
	it('keeps an empty-target ghost before New note without doubling the final gap', () => {
		const cell = document.body.createDiv('board-cell');
		const button = cell.createEl('button', { cls: 'board-new-note-button' });

		expect(getComputedStyle(cell).display).toBe('flex');
		expect(getComputedStyle(cell).flexDirection).toBe('column');
		expect(getComputedStyle(button).order).toBe('1');
		expect(getComputedStyle(button).marginTop).toBe('8px');

		const ghost = cell.createDiv('board-card board-sortable-ghost');
		expect(getComputedStyle(ghost).order).not.toBe('1');
		expect(getComputedStyle(ghost).marginBottom).toBe('8px');
		expect(getComputedStyle(button).marginTop).toBe('0px');
	});

	it('preserves the row-wrapping gallery override', () => {
		const gallery = document.body.createDiv('board-rows-container is-gallery');
		const cell = gallery.createDiv('board-cell');
		cell.createDiv('board-card');
		const button = cell.createEl('button', { cls: 'board-new-note-button' });

		expect(getComputedStyle(cell).flexDirection).toBe('row');
		expect(getComputedStyle(cell).flexWrap).toBe('wrap');
		expect(getComputedStyle(button).order).toBe('1');
		expect(getComputedStyle(button).marginTop).toBe('0px');
	});
});
