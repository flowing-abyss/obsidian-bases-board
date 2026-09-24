import { App, Notice, TFile } from 'obsidian';
import { findFrontmatterKey } from 'Utils';
import Services from '../Base/Services';

export const PROPERTY_EDITOR_CLASS = 'board-card-property-editor';

// Obsidian has no public API for its property editors. These are the widgets the
// Properties view renders, so cards edit values exactly like the note does.
interface PropertyWidgetContext {
	app: App;
	key: string;
	sourcePath: string;
	// Bases views preview links under their own page preview setting
	hoverSource: string;
	blur(): void;
	onChange(value: unknown): void;
}

interface PropertyWidget {
	type?: string;
	render(el: HTMLElement, value: unknown, ctx: PropertyWidgetContext): unknown;
}

interface MetadataTypeManager {
	// `inferred` is the assigned type's widget when the value fits it, as in Bases
	getTypeInfo(key: string, value: unknown): { inferred: PropertyWidget };
}

/** The editor a widget renders */
export interface PropertyEditor {
	// Shows and focuses the field, even where the widget first shows a link
	focus?(position?: 'end'): void;
}

export interface PropertyEditorEvents {
	/** Called when a new value starts being written to the note */
	onSave?(): void;
	/** Called when that write fails, so the note keeps its previous value */
	onSaveFailed?(): void;
	/** Called after Enter or Escape ends the edit */
	onBlur?(): void;
}

interface NoteProperty {
	widget: PropertyWidget;
	noteKey: string; // the key as the note spells it
	value: unknown;
}

// Widgets that show a list of values as pills
const LIST_WIDGET_TYPES = new Set(['aliases', 'multitext', 'tags']);

let reportedFailure = false;

/** Whether this Obsidian version exposes the property editors */
export function canRenderPropertyEditors(): boolean {
	return getTypeManager() !== null;
}

/** Whether the property is edited as a list of pills that can be removed and added to */
export function hasListEditor(file: TFile, key: string): boolean {
	try {
		return isListWidgetType(getNoteProperty(file, key)?.widget.type);
	} catch {
		return false;
	}
}

/** Whether an editor rendered with this `data-property-type` is a list of pills */
export function isListWidgetType(type: string | undefined): boolean {
	return LIST_WIDGET_TYPES.has(type ?? '');
}

/**
 * Renders Obsidian's editor for a frontmatter property into `el`, reporting
 * writes and the end of the edit through `events`.
 * Returns null when the internal widget API is unavailable or fails, so the
 * caller can fall back to read-only rendering.
 */
export function renderPropertyEditor(
	el: HTMLElement,
	file: TFile,
	key: string,
	events: PropertyEditorEvents = {},
): PropertyEditor | null {
	try {
		const property = getNoteProperty(file, key);
		if (!property) return null;
		const { widget, noteKey } = property;
		let saved = property.value;
		if (widget.type) el.dataset.propertyType = widget.type;
		const editor = widget.render(el, saved, {
			app: Services.app,
			key,
			sourcePath: file.path,
			hoverSource: 'bases',
			// Enter and Escape end the edit, which lets the board show the new value
			blur: () => {
				const active = el.ownerDocument.activeElement;
				if (active && el.contains(active) && active.instanceOf(HTMLElement)) active.blur();
				events.onBlur?.();
			},
			onChange: (value) => {
				// Like the Properties view, a cleared value leaves the key empty
				const next = isBlank(value) ? null : value;
				if (isSameValue(next, saved)) return;
				const previous = saved;
				saved = next;
				events.onSave?.();
				void Services.propertyManager
					.updateFrontmatter(file, noteKey, next)
					.catch((error: unknown) => {
						console.error(`[Bases Board] Failed to update ${key}`, error);
						new Notice(`Could not update ${key}.`);
						// A later edit may already have replaced this value
						if (saved === next) saved = previous;
						events.onSaveFailed?.();
					});
			},
		});
		return editor ?? {};
	} catch (error) {
		// One report is enough when an Obsidian update changes the widgets
		if (!reportedFailure) {
			reportedFailure = true;
			console.error(`[Bases Board] Failed to render the ${key} editor`, error);
		}
		el.empty();
		delete el.dataset.propertyType;
		return null;
	}
}

function getTypeManager(): MetadataTypeManager | null {
	const typeManager = (
		Services.app as App & { metadataTypeManager?: Partial<MetadataTypeManager> }
	).metadataTypeManager;
	return typeof typeManager?.getTypeInfo === 'function'
		? (typeManager as MetadataTypeManager)
		: null;
}

function getNoteProperty(file: TFile, key: string): NoteProperty | null {
	const typeManager = getTypeManager();
	if (!typeManager) return null;

	const frontmatter: Record<string, unknown> | undefined =
		Services.app.metadataCache.getFileCache(file)?.frontmatter;
	// Edit the key the note already uses, whatever its case
	const noteKey = findFrontmatterKey(frontmatter, key);
	const value = frontmatter?.[noteKey] ?? null;
	return { widget: typeManager.getTypeInfo(key, value).inferred, noteKey, value };
}

function isSameValue(next: unknown, previous: unknown): boolean {
	// Leaving an empty field must not add an empty key to the note
	if (isBlank(next) && isBlank(previous)) return true;
	return JSON.stringify(next) === JSON.stringify(previous);
}

function isBlank(value: unknown): boolean {
	return (
		value === null ||
		value === undefined ||
		value === '' ||
		(Array.isArray(value) && value.length === 0)
	);
}
