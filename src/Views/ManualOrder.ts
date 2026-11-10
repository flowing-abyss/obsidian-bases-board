import { findFrontmatterKey } from 'Utils';

// Card order in the cells a manual-order drop touched, read from the board after the drop
export interface ManualOrderDrop {
	propertyId: string;
	targetIds: string[]; // the target cell, dragged card included
	sourceIds: string[] | null; // the rest of the source cell, or null for a drop within one cell
}

export interface FrontmatterWrite {
	path: string;
	values: Record<string, unknown>;
}

type ManualOrderPlan =
	| { ok: true; dragged: FrontmatterWrite | null; others: FrontmatterWrite[] }
	| { ok: false; invalidPaths: string[] };

function isOrderNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

// Only an absent or numeric value may be renumbered; text, lists and numbers written as
// text ("12") were typed by the user and must never be overwritten
export function isReplaceableOrderValue(value: unknown): boolean {
	return value === undefined || value === null || isOrderNumber(value);
}

// Numbers a cell 1..N in the given order and returns only the values that change
export function computeCellOrder(
	ids: readonly string[],
	readValue: (id: string) => unknown,
): Map<string, number> {
	const updates = new Map<string, number>();
	ids.forEach((id, index) => {
		if (readValue(id) !== index + 1) updates.set(id, index + 1);
	});
	return updates;
}

/**
 * Plans the frontmatter writes of a manual-order drop: the dragged card gets its group
 * values and its order in one write, then the other cards of the touched cells are
 * renumbered. Any non-numeric order value in those cells cancels the whole drop.
 */
export function planManualOrderDrop(
	itemId: string,
	groupUpdates: Readonly<Record<string, unknown>>,
	drop: ManualOrderDrop,
	orderKey: string,
	readValue: (id: string) => unknown,
): ManualOrderPlan {
	const cells = [drop.targetIds];
	if (drop.sourceIds) cells.push(drop.sourceIds.filter((id) => id !== itemId));
	const invalidPaths = cells.flat().filter((id) => !isReplaceableOrderValue(readValue(id)));
	if (invalidPaths.length > 0) return { ok: false, invalidPaths };

	const orderUpdates = new Map(cells.flatMap((ids) => [...computeCellOrder(ids, readValue)]));
	const draggedValues: Record<string, unknown> = { ...groupUpdates };
	const draggedOrder = orderUpdates.get(itemId);
	if (draggedOrder !== undefined) draggedValues[orderKey] = draggedOrder;
	orderUpdates.delete(itemId);

	return {
		ok: true,
		dragged:
			Object.keys(draggedValues).length > 0 ? { path: itemId, values: draggedValues } : null,
		others: [...orderUpdates].map(([path, order]) => ({ path, values: { [orderKey]: order } })),
	};
}

// Checked again inside the write, as the note may have changed since the drop was planned
export function assertReplaceableOrderValue(
	frontmatter: Readonly<Record<string, unknown>>,
	orderKey: string,
): void {
	const value = frontmatter[findFrontmatterKey(frontmatter, orderKey)];
	if (!isReplaceableOrderValue(value)) {
		throw new Error(`Refusing to overwrite the non-numeric "${orderKey}" value`);
	}
}

// Card ids of a cell in board order. A card dragged with pull: 'clone' leaves a copy in
// its source cell, which is skipped.
export function collectCellOrder(cell: HTMLElement, dragged: HTMLElement): string[] {
	const draggedId = dragged.dataset.itemId;
	return Array.from(cell.children)
		.filter((el): el is HTMLElement => el.matches('.board-card[data-item-id]'))
		.filter((el) => el === dragged || el.dataset.itemId !== draggedId)
		.map((el) => el.dataset.itemId ?? '');
}
