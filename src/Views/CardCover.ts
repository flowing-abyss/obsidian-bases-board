import { getLinkpath, ListValue, Value } from 'obsidian';
import Services from '../Base/Services';

type CoverKind = 'image' | 'video';

interface CoverSource {
	kind: CoverKind;
	src: string;
}

// Cover videos of a rendered board by source
export type CoverVideos = Map<string, HTMLVideoElement>;

// Formats Obsidian itself can embed
const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
const VIDEO_EXTENSIONS = new Set(['mkv', 'mov', 'mp4', 'ogv', 'webm']);

// [[path]], ![[path|150]]
const WIKILINK = /^!?\[\[([^\]]+)\]\]$/;
// [alt](target), ![alt](<target with spaces> "title")
const MARKDOWN_LINK = /^!?\[[^\]]*\]\((.+)\)$/;
// Two or more letters, so Windows drive letters are not mistaken for a scheme
const URL_SCHEME = /^[a-z][a-z\d+.-]+:/i;

/**
 * Resolves a cover property value to something an <img> or <video> can load.
 * Accepts URLs, wiki and Markdown links (embedded or not) and plain vault paths.
 * Returns null when the value is empty or points to a missing or non-media file.
 */
export function resolveCoverSource(value: Value | null, sourcePath: string): CoverSource | null {
	if (value instanceof ListValue) {
		return value.length() > 0 ? resolveCoverSource(value.get(0), sourcePath) : null;
	}
	if (!value?.isTruthy()) return null;
	return resolveCoverText(value.toString().trim(), sourcePath);
}

/**
 * Collects the cover videos under `root` before a re-render, so a video keeps its
 * loaded frame and playback instead of starting over.
 */
export function collectCoverVideos(root: HTMLElement): CoverVideos {
	const videos: CoverVideos = new Map();
	for (const video of Array.from(root.querySelectorAll('video'))) {
		const src = video.dataset.coverSrc;
		if (src && !videos.has(src)) videos.set(src, video);
	}
	return videos;
}

/**
 * Appends the cover to the card. A cover that cannot be resolved or loaded looks
 * the same as an empty one: a placeholder, or nothing when placeholders are hidden.
 * A video from `reusableVideos` moves into the card instead of loading again.
 */
export function renderCardCover(
	card: HTMLElement,
	value: Value | null,
	sourcePath: string,
	showPlaceholder: boolean,
	reusableVideos?: CoverVideos,
): void {
	const cover = resolveCoverSource(value, sourcePath);
	if (!cover) {
		if (showPlaceholder) card.appendChild(createPlaceholder());
		return;
	}

	const reused = cover.kind === 'video' ? reusableVideos?.get(cover.src) : undefined;
	if (reused) {
		reusableVideos?.delete(cover.src);
		card.appendChild(reused);
		return;
	}

	const media = cover.kind === 'video' ? createVideo(cover.src) : createImage(cover.src);
	media.addEventListener(
		'error',
		() => {
			if (showPlaceholder) media.replaceWith(createPlaceholder());
			else media.remove();
		},
		{ once: true },
	);
	card.appendChild(media);
}

function resolveCoverText(text: string, sourcePath: string): CoverSource | null {
	const wikilink = WIKILINK.exec(text);
	if (wikilink) return resolveVaultMedia(wikilink[1]?.split('|')[0] ?? '', sourcePath);

	const markdownLink = MARKDOWN_LINK.exec(text);
	const target = markdownLink ? getMarkdownLinkTarget(markdownLink[1] ?? '') : text;
	if (URL_SCHEME.test(target)) {
		// Extensionless URLs are common for images, so only known video formats switch kind
		const kind = getMediaKind(getExtension(target.split(/[?#]/)[0] ?? ''));
		return { kind: kind === 'video' ? 'video' : 'image', src: target };
	}
	// Markdown links percent-encode spaces in vault paths
	return resolveVaultMedia(markdownLink ? decodeLinkTarget(target) : target, sourcePath);
}

function resolveVaultMedia(link: string, sourcePath: string): CoverSource | null {
	const { metadataCache, vault } = Services.app;
	const file = metadataCache.getFirstLinkpathDest(getLinkpath(link.trim()), sourcePath);
	if (!file) return null;
	const kind = getMediaKind(file.extension);
	return kind ? { kind, src: vault.getResourcePath(file) } : null;
}

function getMarkdownLinkTarget(destination: string): string {
	const trimmed = destination.trim();
	const angled = /^<([^>]*)>/.exec(trimmed);
	return (angled ? angled[1] : trimmed.split(/\s/)[0]) ?? '';
}

function decodeLinkTarget(target: string): string {
	try {
		return decodeURI(target);
	} catch {
		return target;
	}
}

function getExtension(path: string): string {
	return /\.([^./]+)$/.exec(path)?.[1] ?? '';
}

function getMediaKind(extension: string): CoverKind | null {
	const normalized = extension.toLowerCase();
	if (IMAGE_EXTENSIONS.has(normalized)) return 'image';
	if (VIDEO_EXTENSIONS.has(normalized)) return 'video';
	return null;
}

function createPlaceholder(): HTMLElement {
	return createDiv({ cls: ['card-image', 'placeholder'] });
}

function createImage(src: string): HTMLImageElement {
	const img = createEl('img', { cls: 'card-image' });
	img.src = src;
	img.alt = '';
	img.loading = 'lazy';
	img.decoding = 'async';
	return img;
}

function createVideo(src: string): HTMLVideoElement {
	// Never autoplays: the user starts playback with the native controls
	const video = createEl('video', { cls: 'card-image' });
	video.controls = true;
	video.preload = 'metadata';
	video.playsInline = true;
	video.dataset.coverSrc = src;
	// The media fragment makes WebKit (iOS) paint the first frame as a preview
	video.src = src.includes('#') ? src : `${src}#t=0.001`;
	return video;
}
