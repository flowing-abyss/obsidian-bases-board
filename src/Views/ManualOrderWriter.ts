import Services from 'Base/Services';
import { findFrontmatterKey, getPropertyKeyFromId, isWritablePropertyId } from 'Utils';
import { Notice } from 'obsidian';
import {
	assertReplaceableOrderValue,
	FrontmatterWrite,
	isReplaceableOrderValue,
	ManualOrderDrop,
	planManualOrderDrop,
} from './ManualOrder';

// Cancels a write that would change nothing: processFrontMatter re-serializes the YAML,
// so a callback that changes nothing still rewrites the file
class UnchangedFrontmatter extends Error {}

function holdsValues(
	frontmatter: Readonly<Record<string, unknown>>,
	values: Readonly<Record<string, unknown>>,
): boolean {
	return Object.entries(values).every(
		([key, value]) => frontmatter[findFrontmatterKey(frontmatter, key)] === value,
	);
}

/**
 * Writes manual-order drops. The dragged card is written first, in one frontmatter
 * transaction; the cells are renumbered only once it succeeded.
 *
 * The metadata cache lags behind our writes, so a drop planned from it alone could skip
 * a card whose new value the cache does not show yet. The writer remembers the cards it
 * wrote until the cache reports their values; a remembered card is always planned, and
 * its write is cancelled when the file already holds the value. A remembered entry that
 * never clears only costs one file read when that card's cell is touched. Drops are
 * serialized so that each one is planned after the previous one's writes settled.
 */
export class ManualOrderWriter {
	// path -> order key -> value written that the metadata cache has not reported yet
	private readonly written = new Map<string, Map<string, number>>();
	private pending: Promise<void> = Promise.resolve();

	/** Rejects when a write of this drop fails, after logging the notes left unwritten. */
	write(
		itemId: string,
		groupUpdates: Readonly<Record<string, unknown>>,
		drop: ManualOrderDrop,
	): Promise<void> {
		const run = this.pending.then(() => this.writeNow(itemId, groupUpdates, drop));
		// A failed drop must not block the next ones
		this.pending = run.catch(() => undefined);
		return run;
	}

	// Forgets the written values the cache now reports. A different value stays: the
	// cache may report an older state of the note, and a later event will follow.
	onMetadataChanged(path: string, frontmatter: Record<string, unknown> | undefined): void {
		const values = this.written.get(path);
		if (!values) return;
		for (const [key, value] of values) {
			if (frontmatter?.[findFrontmatterKey(frontmatter, key)] === value) values.delete(key);
		}
		if (values.size === 0) this.written.delete(path);
	}

	private async writeNow(
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
		const plan = planManualOrderDrop(itemId, groupUpdates, drop, orderKey, (path) => {
			const cached = propertyManager.getFrontmatterValue(path, orderKey);
			if (!this.written.get(path)?.has(orderKey)) return cached;
			// The cache may be stale for a card we wrote, and so may our value (a sync may
			// have changed the file since): plan a write, checked against the file. A text
			// value in the cache still cancels the drop.
			return isReplaceableOrderValue(cached) ? undefined : cached;
		});
		if (!plan.ok) {
			console.warn(
				`[Bases Board] Drop cancelled: non-numeric "${orderKey}" values in`,
				plan.invalidPaths,
			);
			new Notice(
				`Cannot reorder: "${orderKey}" has a non-numeric value in a card of this cell.`,
			);
			return;
		}

		const write = async ({ path, values }: FrontmatterWrite): Promise<void> => {
			const file = propertyManager.getFile(path);
			if (!file) throw new Error(`Missing file ${path}`);
			const order = values[orderKey];
			// Recorded before writing: the cache may report the change before the write resolves
			const restore = typeof order === 'number' ? this.remember(path, orderKey, order) : null;
			try {
				await propertyManager.updateFrontmatterValues(file, values, (frontmatter) => {
					assertReplaceableOrderValue(frontmatter, orderKey);
					if (holdsValues(frontmatter, values)) throw new UnchangedFrontmatter();
				});
			} catch (error) {
				if (error instanceof UnchangedFrontmatter) return;
				restore?.();
				throw error;
			}
		};

		if (plan.dragged) {
			try {
				await write(plan.dragged);
			} catch (error) {
				console.error(
					'[Bases Board] Failed to write the moved card',
					plan.dragged.path,
					error,
				);
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

	// Records a written value and returns how to restore the previous entry
	private remember(path: string, key: string, value: number): () => void {
		const values = this.written.get(path) ?? new Map<string, number>();
		this.written.set(path, values);
		const previous = values.get(key);
		values.set(key, value);
		return () => {
			if (previous === undefined) values.delete(key);
			else values.set(key, previous);
			if (values.size === 0 && this.written.get(path) === values) this.written.delete(path);
		};
	}
}
