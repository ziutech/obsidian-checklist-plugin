import {ItemView, WorkspaceLeaf} from 'obsidian'

import {TODO_VIEW_TYPE} from './constants'
import App from './svelte/App.svelte'
import {groupTodos, parseTodos} from './utils'

import type { TodoSettings } from "./settings"
import type TodoPlugin from "./main"
import type { TodoGroup, TodoItem } from "./_types"
export default class TodoListView extends ItemView {
  private _app: App
  private lastRerender = 0
  private groupedItems: TodoGroup[] = []
  private itemsByFile = new Map<string, TodoItem[]>()
  private searchTerm = ""

  constructor(leaf: WorkspaceLeaf, private plugin: TodoPlugin) {
    super(leaf)
  }

  getViewType(): string {
    return TODO_VIEW_TYPE
  }

  getDisplayText(): string {
    return "Todo List"
  }

  getIcon(): string {
    return "checkmark"
  }

  get todoTagArray() {
    return this.plugin
      .getSettingValue("todoPageName")
      .trim()
      .split("\n")
      .map((e) => e.toLowerCase())
      .filter((e) => e)
  }

  get visibleTodoTagArray() {
    return this.todoTagArray.filter((t) => !this.plugin.getSettingValue("_hiddenTags").includes(t))
  }

  async onClose() {
    this._app.$destroy()
  }

  async onOpen(): Promise<void> {
    this._app = new App({
      target: (this as any).contentEl,
      props: this.props(),
    })
    this.registerEvent(
      this.app.metadataCache.on("resolved", async () => {
        if (!this.plugin.getSettingValue("autoRefresh")) return
        await this.refresh()
      })
    )
    this.registerEvent(this.app.vault.on("delete", (file) => this.deleteFile(file.path)))
    this.refresh()
  }

  async refresh(all = false) {
    if (all) {
      this.lastRerender = 0
      this.itemsByFile.clear()
    }
    await this.calculateAllItems()
    this.groupItems()
    this.renderView()
    this.lastRerender = +new Date()
  }

  rerender() {
    this.renderView()
  }

  private deleteFile(path: string) {
    this.itemsByFile.delete(path)
    this.groupItems()
    this.renderView()
  }

  private props() {
    return {
      todoTags: this.todoTagArray,
      lookAndFeel: this.plugin.getSettingValue("lookAndFeel"),
      subGroups: this.plugin.getSettingValue("subGroups"),
      _collapsedSections: this.plugin.getSettingValue("_collapsedSections"),
      _hiddenTags: this.plugin.getSettingValue("_hiddenTags"),
      app: this.app,
      todoGroups: this.groupedItems,
      updateSetting: (updates: Partial<TodoSettings>) => this.plugin.updateSettings(updates),
      onSearch: (val: string) => {
        this.searchTerm = val
        this.refresh()
      },
    }
  }

  private async calculateAllItems() {
    const todosForUpdatedFiles = await parseTodos(
      this.app.vault.getFiles(),
      this.todoTagArray.length === 0 ? ["*"] : this.visibleTodoTagArray,
      this.app.metadataCache,
      this.app.vault,
      this.plugin.getSettingValue("includeFiles"),
      this.plugin.getSettingValue("showChecked"),
      this.plugin.getSettingValue("showAllTodos"),
      this.lastRerender
    )
    for (const [file, todos] of todosForUpdatedFiles) {
      this.itemsByFile.set(file.path, todos)
    }
  }

  private groupItems() {
    const flattenedItems = Array.from(this.itemsByFile.values()).flat()

    // Split search term with function
    const searchTerms = this.splitSearchTerm(this.searchTerm.toLowerCase());

    // Filter the results one keyword after another
    let searchedItems = flattenedItems;
    for (const term of searchTerms) {
      searchedItems = searchedItems.filter((e) =>
      e.originalText.toLowerCase().includes(term));
    }
    
    this.groupedItems = groupTodos(
      searchedItems,
      this.plugin.getSettingValue("groupBy"),
      this.plugin.getSettingValue("sortDirectionGroups"),
      this.plugin.getSettingValue("sortDirectionItems"),
      this.plugin.getSettingValue("subGroups"),
      this.plugin.getSettingValue("sortDirectionSubGroups")
    )
  }

  // Makes "" literal search possible by extracting literals and handing them separately
  private splitSearchTerm(searchTerm) {
    // Regex filter for phrases inside of '' and ""
    const regex = /(["'])(.*?)\1/g;
    // Find phrases and extract
    const quotedPhrases = searchTerm.match(regex) || [];
    // Remove literals for easy split by space
    const sanitizedSearchTerm = searchTerm.replace(regex, "").trim();
    // Split by space
    const words = sanitizedSearchTerm.split(" ").filter((word) => word !== "");
    // Remove "" and '' and then add the phrases to the word collection
    for (const phrase of quotedPhrases) {
      const phraseWithoutQuotes = phrase.slice(1, -1);
      words.push(phraseWithoutQuotes);
    }
    return words;
  }

  private renderView() {
    this._app.$set(this.props())
  }
}
