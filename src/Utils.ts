/**
 * Removes the BasesPropertyType prefix from a BasesPropertyId.
 * Assumes the format is "type:name" and returns "name".
 * If no colon is present, returns the original string.
 * @param propertyId The property ID to process.
 * @returns The property name without the type prefix.
 */
export function getPropertyKeyFromId(propertyId: string): string {
	if (!propertyId) return '';
	const parts = propertyId.split('.');
	if (parts.length > 1) {
		return parts.slice(1).join('.');
	}
	return propertyId;
}

export function isWritablePropertyId(
	propertyId: string | null | undefined,
): propertyId is `note.${string}` {
	return propertyId?.startsWith('note.') ?? false;
}

/**
 * Property names are case-insensitive in Obsidian, so a note may store the `status`
 * property as `Status`. Returns the key the note uses, or `key` when it has none.
 */
export function findFrontmatterKey(
	frontmatter: Readonly<Record<string, unknown>> | null | undefined,
	key: string,
): string {
	if (!frontmatter || Object.prototype.hasOwnProperty.call(frontmatter, key)) return key;
	const lowerKey = key.toLowerCase();
	return Object.keys(frontmatter).find((existing) => existing.toLowerCase() === lowerKey) ?? key;
}
