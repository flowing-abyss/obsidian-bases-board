import { BasesEntry, BasesPropertyId, setIcon } from 'obsidian';
import Services from '../Base/Services';
import { wrapEmbeddedBasesLinks } from './BasesLinkCompatibility';
import { BoardOptions } from './OptionsExtractor';

interface PropertyViewContext {
	options?: BoardOptions;
}

export class PropertyView {
	private options?: BoardOptions;

	constructor(ctx: PropertyViewContext) {
		this.options = ctx.options;
	}

	render(entry: BasesEntry, propId: BasesPropertyId): HTMLElement | null {
		const value = entry.getValue(propId);
		if (value === null) return null;

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
			try {
				value.renderTo(propEl, Services.app.renderContext);
				wrapEmbeddedBasesLinks(propEl);
			} catch (error) {
				console.error(`[Bases Board] Failed to render ${propId}`, error);
				propEl.textContent = value.toString();
			}
		}

		return propEl;
	}
}
