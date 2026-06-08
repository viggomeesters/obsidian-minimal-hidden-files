import { App, Notice, Platform, Plugin, PluginSettingTab, Setting, type Stat } from "obsidian";

declare module "obsidian" {
	interface Vault {
		getConfig(key: string): unknown;
		setConfig(key: string, value: unknown): void;
	}
}

type ReconcileDeletion = (realPath: string, vaultPath: string) => Promise<void>;

interface InternalFileSystemAdapter {
	_exists(fullPath: string, vaultPath: string): Promise<boolean>;
	getFullPath(vaultPath: string): string;
	getRealPath(vaultPath: string): string;
	listRecursive(vaultPath: string): Promise<void>;
	reconcileDeletion: ReconcileDeletion;
	reconcileFileInternal?(realPath: string, vaultPath: string): Promise<void>;
	reconcileFolderCreation(realPath: string, vaultPath: string): Promise<void>;
	stat(vaultPath: string): Promise<Stat | null>;
}

interface MinimalHiddenFilesSettings {
	showHiddenFiles: boolean;
	showUnsupportedFiles: boolean;
}

const DEFAULT_SETTINGS: MinimalHiddenFilesSettings = {
	showHiddenFiles: true,
	showUnsupportedFiles: true,
};

const DENIED_DOT_SEGMENTS = new Set([".obsidian", ".trash", ".git"]);

function pathSegments(vaultPath: string): string[] {
	return vaultPath.split("/").filter(Boolean);
}

function isDotSegment(segment: string): boolean {
	return segment.length > 1 && segment.startsWith(".");
}

function hasDeniedSegment(vaultPath: string, configDir: string): boolean {
	return pathSegments(vaultPath).some(
		(segment) => segment === configDir || DENIED_DOT_SEGMENTS.has(segment),
	);
}

function isAllowedHiddenPath(vaultPath: string, configDir: string): boolean {
	const segments = pathSegments(vaultPath);
	return segments.some(isDotSegment) && !hasDeniedSegment(vaultPath, configDir);
}

export default class MinimalHiddenFilesPlugin extends Plugin {
	settings: MinimalHiddenFilesSettings = DEFAULT_SETTINGS;

	private originalReconcileDeletion: ReconcileDeletion | null = null;
	private originalTranslate: ((...args: unknown[]) => string) | null = null;
	private previousShowUnsupportedFiles = false;
	private revealedPaths = new Set<string>();

	async onload(): Promise<void> {
		if (!Platform.isDesktopApp) {
			new Notice("Minimal Hidden Files is desktop-only.");
			return;
		}

		await this.loadSettings();
		this.previousShowUnsupportedFiles = this.getShowUnsupportedFiles();
		this.applyUnsupportedFileVisibility();

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.showHiddenFiles) {
				this.enableHiddenFiles().catch((error) => {
					console.error("Minimal Hidden Files: failed to reveal hidden files", error);
					new Notice("Minimal Hidden Files failed to rescan hidden files. See console.");
				});
			}
		});

		this.addSettingTab(new MinimalHiddenFilesSettingTab(this.app, this));
	}

	onunload(): void {
		this.disableHiddenFiles()
			.catch((error) => {
				console.error("Minimal Hidden Files: failed to restore hidden file state", error);
			})
			.finally(() => {
				this.restoreUnsupportedFileVisibility();
			});
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<MinimalHiddenFilesSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	applyUnsupportedFileVisibility(): void {
		this.app.vault.setConfig("showUnsupportedFiles", this.settings.showUnsupportedFiles);
	}

	async enableHiddenFiles(): Promise<void> {
		this.patchAdapter();
		this.suppressDotfileWarning();
		await this.adapter().listRecursive("");
	}

	async disableHiddenFiles(): Promise<void> {
		await this.hideRevealedPaths();
		this.restoreAdapter();
		this.restoreDotfileWarning();
	}

	private getShowUnsupportedFiles(): boolean {
		return Boolean(this.app.vault.getConfig("showUnsupportedFiles"));
	}

	private restoreUnsupportedFileVisibility(): void {
		this.app.vault.setConfig("showUnsupportedFiles", this.previousShowUnsupportedFiles);
	}

	private adapter(): InternalFileSystemAdapter {
		return this.app.vault.adapter as unknown as InternalFileSystemAdapter;
	}

	private patchAdapter(): void {
		if (this.originalReconcileDeletion) {
			return;
		}

		const adapter = this.adapter();
		const originalReconcileDeletion: ReconcileDeletion = adapter.reconcileDeletion.bind(adapter);
		this.originalReconcileDeletion = originalReconcileDeletion;

		adapter.reconcileDeletion = async (realPath: string, vaultPath: string): Promise<void> => {
			if (
				!this.settings.showHiddenFiles ||
				!isAllowedHiddenPath(vaultPath, this.app.vault.configDir)
			) {
				await originalReconcileDeletion(realPath, vaultPath);
				return;
			}

			const fullPath = adapter.getFullPath(vaultPath);
			if (!(await adapter._exists(fullPath, vaultPath))) {
				this.revealedPaths.delete(vaultPath);
				await originalReconcileDeletion(realPath, vaultPath);
				return;
			}

			this.revealedPaths.add(vaultPath);
			await this.revealPath(vaultPath);
		};
	}

	private restoreAdapter(): void {
		if (!this.originalReconcileDeletion) {
			return;
		}

		this.adapter().reconcileDeletion = this.originalReconcileDeletion;
		this.originalReconcileDeletion = null;
		this.revealedPaths.clear();
	}

	private async revealPath(vaultPath: string): Promise<void> {
		const adapter = this.adapter();
		const realPath = adapter.getRealPath(vaultPath);
		const pathStat = await adapter.stat(vaultPath);

		if (pathStat?.type === "folder") {
			await adapter.reconcileFolderCreation(realPath, vaultPath);
			await adapter.listRecursive(vaultPath);
			return;
		}

		if (adapter.reconcileFileInternal) {
			await adapter.reconcileFileInternal(realPath, vaultPath);
		}
	}

	private async hideRevealedPaths(): Promise<void> {
		if (!this.originalReconcileDeletion) {
			this.revealedPaths.clear();
			return;
		}

		const adapter = this.adapter();
		const paths = Array.from(this.revealedPaths).sort((a, b) => b.length - a.length);
		for (const vaultPath of paths) {
			await this.originalReconcileDeletion(adapter.getRealPath(vaultPath), vaultPath);
		}
		this.revealedPaths.clear();
	}

	private suppressDotfileWarning(): void {
		const targetWindow = window as unknown as {
			i18next?: { t: (...args: unknown[]) => string };
		};

		if (!targetWindow.i18next || this.originalTranslate) {
			return;
		}

		const originalTranslate = targetWindow.i18next.t.bind(targetWindow.i18next);
		this.originalTranslate = originalTranslate;

		targetWindow.i18next.t = (...args: unknown[]): string => {
			if (args[0] === "plugins.file-explorer.msg-bad-dotfile") {
				return "";
			}
			return originalTranslate(...args);
		};
	}

	private restoreDotfileWarning(): void {
		const targetWindow = window as unknown as {
			i18next?: { t: (...args: unknown[]) => string };
		};

		if (targetWindow.i18next && this.originalTranslate) {
			targetWindow.i18next.t = this.originalTranslate;
		}
		this.originalTranslate = null;
	}
}

class MinimalHiddenFilesSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: MinimalHiddenFilesPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Reveal dotfiles and dotfolders")
			.setDesc("Shows allowed dot-prefixed files and folders in the native File Explorer.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showHiddenFiles).onChange(async (value) => {
					this.plugin.settings.showHiddenFiles = value;
					await this.plugin.saveSettings();

					if (value) {
						await this.plugin.enableHiddenFiles();
					} else {
						await this.plugin.disableHiddenFiles();
					}
				});
			});

		new Setting(containerEl)
			.setName("Show unsupported file types")
			.setDesc('Mirrors Obsidian\'s native "Detect all file extensions" setting.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showUnsupportedFiles).onChange(async (value) => {
					this.plugin.settings.showUnsupportedFiles = value;
					await this.plugin.saveSettings();
					this.plugin.applyUnsupportedFileVisibility();
				});
			});

		new Setting(containerEl)
			.setName("Default exclusions")
			.setDesc(".obsidian, .trash, and .git are always hidden in v0.1.");
	}
}
