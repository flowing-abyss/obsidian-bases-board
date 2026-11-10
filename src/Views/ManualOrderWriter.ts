import Services from 'Base/Services';
import { getPropertyKeyFromId, isWritablePropertyId } from 'Utils';
import { Notice } from 'obsidian';
import {
	assertReplaceableOrderValue,
	FrontmatterWrite,
	ManualOrderDrop,
	planManualOrderDrop,
} from './ManualOrder';

/**
 * Writes a manual-order drop. The dragged card is written first, in one frontmatter
 * transaction; the cells are renumbered only once it succeeded. Rejects when a write
 * fails, after logging the notes left unwritten.
 */
export async function writeManualOrderDrop(
	itemId: string,
	groupUpdates: Readonly<Record<string, unknown>>,
	drop: ManualOrderDrop,
): Promise<void> {
	if (!isWritablePropertyId(drop.propertyId)) {
		new Notice('Order property must be a note property');
		return;
	}
	const orderKey = getPropertyKeyFromId(drop.propertyId);
	const propertyManager = Services.propertyManager;
	const plan = planManualOrderDrop(itemId, groupUpdates, drop, orderKey, (path) =>
		propertyManager.getFrontmatterValue(path, orderKey),
	);
	if (!plan.ok) {
		console.warn(
			`[Bases Board] Drop cancelled: non-numeric "${orderKey}" values in`,
			plan.invalidPaths,
		);
		new Notice(`Cannot reorder: "${orderKey}" has a non-numeric value in a card of this cell.`);
		return;
	}

	const write = async ({ path, values }: FrontmatterWrite): Promise<void> => {
		const file = propertyManager.getFile(path);
		if (!file) throw new Error(`Missing file ${path}`);
		await propertyManager.updateFrontmatterValues(file, values, (frontmatter) =>
			assertReplaceableOrderValue(frontmatter, orderKey),
		);
	};

	if (plan.dragged) {
		try {
			await write(plan.dragged);
		} catch (error) {
			console.error('[Bases Board] Failed to write the moved card', plan.dragged.path, error);
			throw error;
		}
	}
	const results = await Promise.allSettled(plan.others.map(write));
	const failed: string[] = [];
	const reasons: unknown[] = [];
	results.forEach((result, index) => {
		if (result.status === 'fulfilled') return;
		failed.push(plan.others[index]?.path ?? '');
		reasons.push(result.reason);
	});
	if (failed.length > 0) {
		console.error('[Bases Board] Failed to renumber', failed, reasons);
		throw new Error(`Failed to renumber ${failed.length} card(s)`);
	}
}
