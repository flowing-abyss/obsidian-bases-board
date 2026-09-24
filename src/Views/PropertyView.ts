import { BasesEntry, BasesPropertyId, BooleanValue, NullValue, setIcon, Value } from 'obsidian';
import { getPropertyKeyFromId, isWritablePropertyId } from 'Utils';
import Services from '../Base/Services';
import { wrapEmbeddedBasesLinks } from './BasesLinkCompatibility';
import { BoardOptions } from './OptionsExtractor';
import {
	canRenderPropertyEditors,
	hasListEditor,
	isListWidgetType,
	PROPERTY_EDITOR_CLASS,
	PropertyEditor,
	PropertyEditorEvents,
	renderPropertyEditor,
} from './PropertyEditor';

interface PropertyViewContext {
	options?: BoardOptions;
}

interface Point {
	x: number;
	y: number;
}

const EDITABLE_CLASS = 'board-card-editable';
// Links and controls inside a value keep their own click
const INTERACTIVE_SELECTOR =
	'a, button, input, select, textarea, .internal-link, .external-link, [data-href], .clickable-icon';
// Where typing goes, in order of preference: a list's input comes after its pills
const EDITOR_FIELD_SELECTORS = [
	'.multi-select-input',
	'[contenteditable="true"]',
	'input, textarea, select',
	'[tabindex="0"]',
];

let focusingQuietly = false;

/** Focuses a property row made editable by `makeEditable` without starting an edit */
export function focusPropertyRow(row: HTMLElement): void {
	// A row that always shows its editor is no tab stop, but can still hold focus
	if (!row.hasAttribute('tabindex')) row.tabIndex = -1;
	focusingQuietly = true;
	try {
		row.focus({ preventScroll: true });
	} finally {
		focusingQuietly = false;
	}
}

export class PropertyView {
	private options?: BoardOptions;

	constructor(ctx: PropertyViewContext) {
		this.options = ctx.options;
	}

	render(entry: BasesEntry, propId: BasesPropertyId): HTMLElement | null {
		const value = entry.getValue(propId);
		if (value === null) return null;
		if (propId !== 'file.name' && this.options?.hideEmptyProperties && isEmptyValue(value)) {
			return null;
		}

		const propEl = createDiv();

		if (propId === 'file.name') {
			// Check if we need to render an icon
			const iconProperty = this.options?.iconProperty;
			const iconVal = iconProperty ? entry.getValue(iconProperty) : null;

			if (iconVal?.isTruthy()) {
				// Create container for icon + file name
				propEl.classList.add('board-card-file-name-container');

				// Resolve icon name through mapping (fallback to raw value)
				const rawIconValue = iconVal.toString();
				const iconName = this.options?.iconMapping?.[rawIconValue] ?? rawIconValue;

				// Create icon element
				const iconEl = createSpan('board-card-icon');
				setIcon(iconEl, iconName);

				// Create file name element
				const fileNameEl = createDiv();
				fileNameEl.classList.add(
					'metadata-property-value',
					'card-prop',
					'file-name',
					'board-card-file-name',
				);
				fileNameEl.classList.add('clickable');
				fileNameEl.textContent = value.toString();

				propEl.appendChild(iconEl);
				propEl.appendChild(fileNameEl);
			} else {
				// No icon, just render file name with padding
				propEl.classList.add(
					'metadata-property-value',
					'card-prop',
					'file-name',
					'board-card-file-name-no-icon',
				);
				propEl.classList.add('clickable');
				propEl.textContent = value.toString();
			}
		} else {
			propEl.classList.add('metadata-property-value', 'card-prop');
			this.renderValue(propEl, value, propId);
		}

		return propEl;
	}

	// Only notes have frontmatter to write to
	canEdit(entry: BasesEntry, propId: BasesPropertyId): boolean {
		return isWritablePropertyId(propId) && entry.file.extension === 'md';
	}

	/**
	 * Lets the user edit a value rendered by `render`. Like a Bases table cell, it
	 * turns into Obsidian's property editor on a click or keyboard focus and back
	 * into a value when left unchanged. Editors cost far more than values and look
	 * different, for example without other plugins' link styling, so a card only
	 * shows one while it is in use. Checkboxes and lists are the exception.
	 */
	makeEditable(propEl: HTMLElement, entry: BasesEntry, propId: BasesPropertyId): void {
		if (!this.canEdit(entry, propId) || !canRenderPropertyEditors()) return;
		// Lets the board put keyboard focus back on the row after it renders
		propEl.dataset.boardProperty = propId;
		// A checkbox looks the same either way and toggles in one click. A list shows
		// its values as pills, so they can be removed and added to right on the card.
		if (
			entry.getValue(propId) instanceof BooleanValue ||
			hasListEditor(entry.file, getPropertyKeyFromId(propId))
		) {
			this.renderPinnedEditor(propEl, entry, propId);
			return;
		}

		propEl.classList.add(EDITABLE_CLASS);
		propEl.tabIndex = 0;
		propEl.addEventListener('click', (evt) => {
			if (!propEl.classList.contains(EDITABLE_CLASS)) return;
			if ((evt.target as Element | null)?.closest(INTERACTIVE_SELECTOR)) return;
			this.startEditing(propEl, entry, propId, { x: evt.clientX, y: evt.clientY });
		});
		propEl.addEventListener('focus', () => {
			if (!focusingQuietly && propEl.matches(':focus-visible')) {
				this.startEditing(propEl, entry, propId);
			}
		});
		// Reopens the editor on a row that kept focus after Enter or Escape
		propEl.addEventListener('keydown', (evt) => {
			if (evt.target !== propEl || !propEl.classList.contains(EDITABLE_CLASS)) return;
			if (evt.key !== 'Enter' && evt.key !== 'F2') return;
			evt.preventDefault();
			evt.stopPropagation();
			this.startEditing(propEl, entry, propId);
		});
	}

	// Checkboxes and lists keep their editor, so a failed write has to put back
	// the value the note kept
	private renderPinnedEditor(propEl: HTMLElement, entry: BasesEntry, propId: BasesPropertyId) {
		this.renderEditor(propEl, entry, propId, {
			onBlur: () => keepFocusOnRow(propEl),
			onSaveFailed: () => {
				const hadFocus = propEl.contains(propEl.ownerDocument.activeElement);
				this.renderPinnedEditor(propEl, entry, propId);
				if (hadFocus) focusPropertyRow(propEl);
			},
		});
	}

	/**
	 * Replaces a value rendered by `render` with Obsidian's property editor.
	 * Keeps the value when the editor cannot be rendered.
	 */
	renderEditor(
		propEl: HTMLElement,
		entry: BasesEntry,
		propId: BasesPropertyId,
		events?: PropertyEditorEvents,
	): PropertyEditor | null {
		if (!this.canEdit(entry, propId)) return null;
		const key = getPropertyKeyFromId(propId);
		const valueEl = createDiv({ cls: ['metadata-property-value', 'card-prop'] });
		const editor = renderPropertyEditor(valueEl, entry.file, key, events);
		if (!editor) return null;

		propEl.classList.remove('metadata-property-value', 'card-prop', EDITABLE_CLASS);
		propEl.classList.add('metadata-property', PROPERTY_EDITOR_CLASS);
		// In an embedded base, Supercharged Links styles pills inside table cells only.
		// Other editors skip the marker, which brings table layout such as right-aligned numbers.
		if (isListWidgetType(valueEl.dataset.propertyType))
			propEl.classList.add('bases-table-cell');
		propEl.removeAttribute('tabindex');
		propEl.dataset.propertyKey = key.toLowerCase();
		propEl.replaceChildren(valueEl);
		return editor;
	}

	private startEditing(
		propEl: HTMLElement,
		entry: BasesEntry,
		propId: BasesPropertyId,
		point?: Point,
	): void {
		const doc = propEl.ownerDocument;
		let saved = false;
		let ended = false;
		// A saved value keeps its editor until the board renders the new data
		const end = (keepFocus: boolean) => {
			if (ended) return;
			ended = true;
			propEl.removeEventListener('blur', onFieldBlur, true);
			if (!saved) this.restoreValue(propEl, entry, propId);
			if (keepFocus) keepFocusOnRow(propEl);
		};
		const onFieldBlur = () => {
			// Focus lands on its next target after blur
			doc.defaultView?.setTimeout(() => {
				const active = doc.activeElement;
				if (active !== propEl && propEl.contains(active)) return;
				end(false);
			}, 0);
		};

		const editor = this.renderEditor(propEl, entry, propId, {
			onSave: () => {
				saved = true;
			},
			onSaveFailed: () => {
				saved = false;
				// No new data will come, so show the value the note kept
				if (ended) this.restoreValue(propEl, entry, propId);
			},
			// Enter and Escape keep keyboard focus on the row
			onBlur: () => end(true),
		});
		if (!editor) return;
		if (!focusEditor(propEl, editor, point)) {
			this.restoreValue(propEl, entry, propId);
			return;
		}
		// Captured blur, unlike focusout, still arrives when the widget rebuilds its field on blur
		propEl.addEventListener('blur', onFieldBlur, true);
	}

	private restoreValue(propEl: HTMLElement, entry: BasesEntry, propId: BasesPropertyId): void {
		propEl.classList.remove('metadata-property', PROPERTY_EDITOR_CLASS, 'bases-table-cell');
		propEl.classList.add('metadata-property-value', 'card-prop', EDITABLE_CLASS);
		delete propEl.dataset.propertyKey;
		propEl.tabIndex = 0;
		propEl.empty();
		const value = entry.getValue(propId);
		if (value) this.renderValue(propEl, value, propId);
	}

	private renderValue(el: HTMLElement, value: Value, propId: BasesPropertyId): void {
		try {
			value.renderTo(el, Services.app.renderContext);
			wrapEmbeddedBasesLinks(el);
		} catch (error) {
			console.error(`[Bases Board] Failed to render ${propId}`, error);
			el.textContent = value.toString();
		}
	}
}

// Enter and Escape leave keyboard focus on the row, unless it has moved on already,
// for example when a click elsewhere closed the editor's suggestions
function keepFocusOnRow(row: HTMLElement): void {
	const doc = row.ownerDocument;
	const active = doc.activeElement;
	if (active && active !== doc.body && !row.contains(active)) return;
	focusPropertyRow(row);
}

// A missing property, an empty string or an empty list. false and 0 are values.
function isEmptyValue(value: Value): boolean {
	return value instanceof NullValue || value.toString().trim() === '';
}

// Focuses the editor's field, with the caret where the value was clicked
function focusEditor(el: HTMLElement, editor: PropertyEditor, point?: Point): boolean {
	const doc = el.ownerDocument;
	// The row itself holds focus after Enter or Escape, which is not a field
	const hasFieldFocus = () => doc.activeElement !== el && el.contains(doc.activeElement);
	// The widget knows its field, which a link value only creates on focus
	if (typeof editor.focus === 'function') editor.focus('end');
	if (!hasFieldFocus()) {
		EDITOR_FIELD_SELECTORS.map((selector) => el.querySelector<HTMLElement>(selector))
			.find((match) => match !== null)
			?.focus();
	}
	const field = doc.activeElement;
	if (!field || !hasFieldFocus()) return false;
	if (!field.instanceOf(HTMLElement) || !field.isContentEditable) return true;

	const selection = doc.getSelection();
	if (!selection) return true;
	// Without caretPositionFromPoint (older installers) the caret goes to the end
	const caret =
		point && typeof doc.caretPositionFromPoint === 'function'
			? doc.caretPositionFromPoint(point.x, point.y)
			: null;
	if (caret && field.contains(caret.offsetNode)) {
		selection.collapse(caret.offsetNode, caret.offset);
	} else {
		selection.selectAllChildren(field);
		selection.collapseToEnd();
	}
	return true;
}
