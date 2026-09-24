import type { Value as ObsidianValue } from 'obsidian';
import { App, ListValue, StringValue, Value } from 'obsidian-test-mocks/obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Services from '../src/Base/Services';
import { collectCoverVideos, renderCardCover, resolveCoverSource } from '../src/Views/CardCover';

class TestListValue extends ListValue {
	constructor(private readonly items: Value[]) {
		super(items);
	}

	override isTruthy(): boolean {
		return this.items.length > 0;
	}

	length(): number {
		return this.items.length;
	}

	get(index: number): Value {
		const item = this.items[index];
		if (!item) throw new Error(`No item at ${index}`);
		return item;
	}
}

const SOURCE = 'sources/Note.md';

function text(value: string): ObsidianValue {
	return StringValue.create__(value).asOriginalType__();
}

function resolve(value: string) {
	return resolveCoverSource(text(value), SOURCE);
}

beforeEach(() => {
	const app = App.createConfigured__({
		files: {
			'files/cover.jpg': '',
			'files/my cover.webp': '',
			'files/clip.mp4': '',
			'Some note.md': '',
		},
	});
	vi.spyOn(app.vault, 'getResourcePath').mockImplementation((file) => `app://vault/${file.path}`);
	Services.app = app.asOriginalType__();
});

describe('resolveCoverSource', () => {
	it('keeps remote URLs as they are', () => {
		expect(resolve('https://example.com/a.png?x=1')).toEqual({
			kind: 'image',
			src: 'https://example.com/a.png?x=1',
		});
		expect(resolve('https://example.com/image')).toEqual({
			kind: 'image',
			src: 'https://example.com/image',
		});
	});

	it('extracts URLs from Markdown links', () => {
		expect(resolve('![cover](https://example.com/a.png)')?.src).toBe(
			'https://example.com/a.png',
		);
		expect(resolve('[Poster](https://example.com/Foo_(bar).jpg)')?.src).toBe(
			'https://example.com/Foo_(bar).jpg',
		);
	});

	it('resolves wiki links to vault files', () => {
		const expected = { kind: 'image', src: 'app://vault/files/cover.jpg' };
		expect(resolve('[[files/cover.jpg|150]]')).toEqual(expected);
		expect(resolve('![[files/cover.jpg]]')).toEqual(expected);
		expect(resolve('[[cover.jpg]]')).toEqual(expected);
	});

	it('resolves Markdown links and plain paths to vault files', () => {
		expect(resolve('![|150](files/my%20cover.webp)')?.src).toBe(
			'app://vault/files/my cover.webp',
		);
		expect(resolve('![](<files/my cover.webp> "Title")')?.src).toBe(
			'app://vault/files/my cover.webp',
		);
		expect(resolve('files/cover.jpg')?.src).toBe('app://vault/files/cover.jpg');
	});

	it('detects videos in the vault and on the web', () => {
		expect(resolve('[[files/clip.mp4]]')).toEqual({
			kind: 'video',
			src: 'app://vault/files/clip.mp4',
		});
		expect(resolve('https://example.com/clip.WEBM?t=1')?.kind).toBe('video');
	});

	it('ignores empty values, missing files and non-media files', () => {
		expect(resolveCoverSource(null, SOURCE)).toBeNull();
		expect(resolve('')).toBeNull();
		expect(resolve('[[files/missing.png]]')).toBeNull();
		expect(resolve('[[Some note]]')).toBeNull();
		expect(resolve('![](missing.png)')).toBeNull();
	});

	it('uses the first item of a list', () => {
		const list = new TestListValue([
			StringValue.create__('[[files/cover.jpg]]'),
			StringValue.create__('https://example.com/b.png'),
		]).asOriginalType__();
		expect(resolveCoverSource(list, SOURCE)?.src).toBe('app://vault/files/cover.jpg');
	});
});

describe('renderCardCover', () => {
	it('treats an unresolved cover like an empty one', () => {
		const withPlaceholder = createDiv();
		renderCardCover(withPlaceholder, text('[[files/missing.png]]'), SOURCE, true);
		expect(withPlaceholder.querySelector('.card-image.placeholder')).not.toBeNull();

		const hidden = createDiv();
		renderCardCover(hidden, text('[[files/missing.png]]'), SOURCE, false);
		expect(hidden.childElementCount).toBe(0);
	});

	it('falls back like an empty cover when the media fails to load', () => {
		const withPlaceholder = createDiv();
		renderCardCover(withPlaceholder, text('https://example.com/broken.png'), SOURCE, true);
		withPlaceholder.querySelector('img')?.dispatchEvent(new Event('error'));
		expect(withPlaceholder.querySelector('img')).toBeNull();
		expect(withPlaceholder.querySelector('.card-image.placeholder')).not.toBeNull();

		const hidden = createDiv();
		renderCardCover(hidden, text('https://example.com/broken.png'), SOURCE, false);
		hidden.querySelector('img')?.dispatchEvent(new Event('error'));
		expect(hidden.childElementCount).toBe(0);
	});

	it('renders vault images and click-to-play videos', () => {
		const card = createDiv();
		renderCardCover(card, text('[[files/cover.jpg|150]]'), SOURCE, true);
		expect(card.querySelector('img.card-image')?.getAttribute('src')).toBe(
			'app://vault/files/cover.jpg',
		);

		renderCardCover(card, text('![[files/clip.mp4]]'), SOURCE, true);
		const video = card.querySelector('video.card-image');
		expect(video).toBeInstanceOf(HTMLVideoElement);
		if (!(video instanceof HTMLVideoElement)) return;
		expect(video.controls).toBe(true);
		expect(video.autoplay).toBe(false);
		expect(video.preload).toBe('metadata');
		expect(video.getAttribute('src')).toBe('app://vault/files/clip.mp4#t=0.001');
	});

	it('moves a loaded video into the re-rendered card instead of loading it again', () => {
		const board = createDiv();
		renderCardCover(board.createDiv(), text('![[files/clip.mp4]]'), SOURCE, true);
		const video = board.querySelector('video');

		const videos = collectCoverVideos(board);
		const card = createDiv();
		renderCardCover(card, text('[[files/clip.mp4]]'), SOURCE, true, videos);
		const other = createDiv();
		renderCardCover(other, text('[[files/clip.mp4]]'), SOURCE, true, videos);

		expect(card.querySelector('video')).toBe(video);
		expect(other.querySelector('video')).not.toBe(video);
	});
});
