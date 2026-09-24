import Services from 'Base/Services';
import { Component, Notice, TFile, TFolder } from 'obsidian';
import { findFrontmatterKey, getPropertyKeyFromId, isWritablePropertyId } from 'Utils';
import { EMPTY_GROUP_ID } from './BoardConstants';
import { BoardOptions } from './OptionsExtractor';

type CreateFileForView = (
	frontmatterProcessor: (frontmatter: Record<string, unknown>) => void,
) => Promise<void>;

export class BoardNoteCreator extends Component {
	private readonly pendingTemplateWaits = new Set<() => void>();

	onunload(): void {
		for (const cancel of [...this.pendingTemplateWaits]) cancel();
		this.pendingTemplateWaits.clear();
	}

	async handleNewNoteClick(
		groupValue: unknown,
		subGroupValue?: unknown,
		groupPropertyId?: string | null,
		subGroupPropertyId?: string | null,
		options?: BoardOptions,
		createFileForView?: CreateFileForView,
	): Promise<void> {
		const folder = options?.newNoteFolder || '';
		const template = options?.newNoteTemplate || '';

		if (folder || template) {
			await this.createNote(
				groupValue,
				subGroupValue,
				groupPropertyId,
				subGroupPropertyId,
				folder,
				template,
				options?.newNoteOpen ?? false,
			);
			return;
		}

		if (!createFileForView) {
			console.warn('[BoardNoteCreator] Native Bases file creator is unavailable');
			return;
		}

		try {
			await createFileForView((frontmatter) => {
				this.assignGroupValuesToFrontmatter(
					frontmatter,
					groupValue,
					subGroupValue,
					groupPropertyId,
					subGroupPropertyId,
				);
			});
		} catch (error) {
			console.error('[BoardNoteCreator] Failed to create note', error);
		}
	}

	private async createNote(
		groupValue: unknown,
		subGroupValue: unknown,
		groupPropertyId: string | null | undefined,
		subGroupPropertyId: string | null | undefined,
		folderPath: string,
		templatePath: string,
		openAfterCreation = false,
	): Promise<void> {
		const app = Services.app;
		let newFile: TFile | null = null;

		try {
			const folder = this.resolveFolder(folderPath);
			if (templatePath) {
				const templateFile = app.vault.getFileByPath(templatePath);
				if (!templateFile) throw new Error(`Template not found: ${templatePath}`);
				const content = await app.vault.cachedRead(templateFile);
				newFile = await this.createUntitledFile(folder, content);
				await this.waitForTemplateProcessing(newFile, content);
			}

			// No template or template file not found — create blank file
			if (!newFile) {
				newFile = await this.createUntitledFile(folder);
			}

			await this.assignGroupValues(
				newFile,
				groupValue,
				subGroupValue,
				groupPropertyId,
				subGroupPropertyId,
			);
			if (openAfterCreation) {
				await app.workspace.openLinkText(newFile.path, '', true);
			}
		} catch (e) {
			console.error('[BoardNoteCreator] Failed to create note', e);
			new Notice(e instanceof Error ? e.message : 'Could not create the note.');
		}
	}

	private async waitForTemplateProcessing(file: TFile, templateContent: string): Promise<void> {
		if (!this.hasTemplaterCommands(templateContent)) return;

		const app = Services.app;
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const timeoutId = window.setTimeout(() => {
				finish(
					new Error(
						'Timed out waiting for Templater. The board properties were not written to avoid corrupting the template frontmatter.',
					),
				);
			}, 120_000);
			const eventRef = app.vault.on('modify', (modifiedFile) => {
				if (modifiedFile.path === file.path) void checkContent();
			});

			const finish = (error?: Error) => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timeoutId);
				app.vault.offref(eventRef);
				this.pendingTemplateWaits.delete(cancel);
				if (error) reject(error);
				else resolve();
			};
			const cancel = () =>
				finish(new Error('Note creation was cancelled because the board closed.'));
			this.pendingTemplateWaits.add(cancel);

			const checkContent = async () => {
				try {
					const content = await app.vault.read(file);
					if (!this.hasTemplaterCommands(content)) finish();
				} catch (error) {
					finish(error instanceof Error ? error : new Error(String(error)));
				}
			};

			void checkContent();
		});
	}

	private hasTemplaterCommands(content: string): boolean {
		return /<%[-_*+]?[\s\S]*?%>/.test(content);
	}

	private async createUntitledFile(folder: TFolder, content = ''): Promise<TFile> {
		const folderPrefix = folder.path ? `${folder.path}/` : '';
		let suffix = 0;

		while (true) {
			const name = suffix === 0 ? 'Untitled.md' : `Untitled ${suffix}.md`;
			const path = `${folderPrefix}${name}`;
			if (!Services.app.vault.getAbstractFileByPath(path)) {
				try {
					return await Services.app.vault.create(path, content);
				} catch (error) {
					if (!Services.app.vault.getAbstractFileByPath(path)) throw error;
				}
			}
			suffix += 1;
		}
	}

	private resolveFolder(folderPath: string): TFolder {
		if (folderPath) {
			const folder = Services.app.vault.getFolderByPath(folderPath);
			if (folder) return folder;
			throw new Error(`Folder not found: ${folderPath}`);
		}
		return Services.app.vault.getRoot();
	}

	private async assignGroupValues(
		file: TFile,
		groupValue: unknown,
		subGroupValue?: unknown,
		groupPropertyId?: string | null,
		subGroupPropertyId?: string | null,
	): Promise<void> {
		if (!groupPropertyId && !subGroupPropertyId) return;

		await Services.app.fileManager.processFrontMatter(file, (frontmatter) => {
			this.assignGroupValuesToFrontmatter(
				frontmatter as Record<string, unknown>,
				groupValue,
				subGroupValue,
				groupPropertyId,
				subGroupPropertyId,
			);
		});
	}

	private assignGroupValuesToFrontmatter(
		frontmatter: Record<string, unknown>,
		groupValue: unknown,
		subGroupValue?: unknown,
		groupPropertyId?: string | null,
		subGroupPropertyId?: string | null,
	): void {
		if (
			isWritablePropertyId(groupPropertyId) &&
			groupValue !== null &&
			groupValue !== EMPTY_GROUP_ID
		) {
			const groupPropertyKey = getPropertyKeyFromId(groupPropertyId);
			frontmatter[findFrontmatterKey(frontmatter, groupPropertyKey)] = groupValue;
		}

		if (
			isWritablePropertyId(subGroupPropertyId) &&
			subGroupValue !== undefined &&
			subGroupValue !== null &&
			subGroupValue !== EMPTY_GROUP_ID
		) {
			const subGroupPropertyKey = getPropertyKeyFromId(subGroupPropertyId);
			frontmatter[findFrontmatterKey(frontmatter, subGroupPropertyKey)] = subGroupValue;
		}
	}
}
