/**
 * VSCode API Mock for Testing
 */

// Shared mock state
const mockState = {
  models: [] as LanguageModelChat[],
}

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = []

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener)
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener)
        if (index > -1) this.listeners.splice(index, 1)
      },
    }
  }

  fire(data: T): void {
    for (const listener of this.listeners) listener(listener)
  }

  dispose(): void {
    this.listeners = []
  }
}

export interface CancellationToken {
  isCancellationRequested: boolean
  onCancellationRequested: (listener: () => void) => { dispose: () => void }
}

export class CancellationTokenSource {
  private _token: CancellationToken

  constructor() {
    this._token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    }
  }

  get token(): CancellationToken {
    return this._token
  }

  cancel(): void {
    this._token.isCancellationRequested = true
  }

  dispose(): void {}
}

export class LanguageModelTextPart {
  constructor(public value: string) {}
}

export class LanguageModelToolCallPart {
  constructor(
    public name: string,
    public toolCallId: string,
    public parameters: Record<string, unknown>,
  ) {}
}

export class LanguageModelToolResultPart {
  constructor(
    public toolCallId: string,
    public content: string | Array<LanguageModelTextPart>,
  ) {}
}

export enum LanguageModelChatMessageRole {
  User = 1,
  Assistant = 2,
}

export class LanguageModelChatMessage {
  constructor(
    public role: LanguageModelChatMessageRole,
    public content:
      | string
      | Array<
          | LanguageModelTextPart
          | LanguageModelToolResultPart
          | LanguageModelToolCallPart
        >,
    public name?: string,
  ) {}
}

export interface LanguageModelChatResponse {
  text: AsyncIterable<string>
  stream: AsyncIterable<LanguageModelTextPart | LanguageModelToolCallPart>
}

export class LanguageModelChat {
  constructor(
    public id: string,
    public vendor: string,
    public family: string,
    public version: string,
    public name: string,
    public maxInputTokens = 8192,
  ) {}

  async countTokens(
    messages: string | LanguageModelChatMessage[],
  ): Promise<number> {
    if (typeof messages === 'string') {
      return Math.ceil(messages.length / 4)
    }
    let total = 0
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += Math.ceil(msg.content.length / 4)
      } else if (msg.content instanceof LanguageModelTextPart) {
        total += Math.ceil(msg.content.value.length / 4)
      }
    }
    return total
  }

  async sendRequest(
    messages: LanguageModelChatMessage[],
    options?: {
      justification?: string
      modelOptions?: Record<string, unknown>
      tools?: Array<{
        name: string
        description: string
        inputSchema: Record<string, unknown>
      }>
    },
    token?: CancellationToken,
  ): Promise<LanguageModelChatResponse> {
    const responseText = 'Mock response'
    return {
      text: (async function* () {
        yield responseText
      })(),
      stream: (async function* () {
        yield new LanguageModelTextPart(responseText)
      })(),
    }
  }
}

export class Memento {
  private storage = new Map<string, unknown>()

  get<T>(key: string): T | undefined
  get<T>(key: string, defaultValue: T): T
  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.storage.get(key)
    return value !== undefined ? (value as T) : defaultValue
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.storage.delete(key)
    } else {
      this.storage.set(key, value)
    }
  }

  keys(): readonly string[] {
    return Array.from(this.storage.keys())
  }

  _getAll(): Map<string, unknown> {
    return new Map(this.storage)
  }
}

export interface ExtensionContext {
  subscriptions: Array<{ dispose(): void }>
  globalState: Memento
  workspaceState: Memento
  extensionPath: string
  extensionUri: { fsPath: string }
  asAbsolutePath(relativePath: string): string
}

export namespace lm {
  export async function selectChatModels(options?: {
    id?: string
    vendor?: string
    family?: string
  }): Promise<LanguageModelChat[]> {
    if (!options) return mockState.models

    return mockState.models.filter(model => {
      if (options.id && model.id !== options.id) return false
      if (options.vendor && model.vendor !== options.vendor) return false
      if (options.family && model.family !== options.family) return false
      return true
    })
  }

  export function _setMockModels(models: LanguageModelChat[]): void {
    mockState.models = models
  }

  export function _resetMockModels(): void {
    mockState.models = []
  }
}

export namespace window {
  export function showQuickPick<T>(
    items: T[],
    options?: { placeHolder?: string },
  ): Promise<T | undefined> {
    return Promise.resolve(items[0])
  }

  export function showErrorMessage(message: string): Promise<void> {
    return Promise.resolve()
  }

  export function showInformationMessage(message: string): Promise<void> {
    return Promise.resolve()
  }

  export function showWarningMessage(message: string): Promise<void> {
    return Promise.resolve()
  }

  export function createOutputChannel(name: string) {
    return {
      appendLine: (line: string) => {},
      append: (text: string) => {},
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }
  }
}

export namespace env {
  export const clipboard = {
    writeText: async (text: string): Promise<void> => {},
  }
}

export namespace workspace {
  export function getConfiguration(section?: string) {
    return {
      get<T>(key: string, defaultValue?: T): T | undefined {
        if (key === 'logLevel') return 1 as T
        if (key === 'showOutputOnStartup') return false as T
        if (key === 'port') return 4000 as T
        if (key === 'apiKey') return '' as T
        if (key === 'enableCORS') return false as T
        return defaultValue
      },
      has(key: string): boolean {
        return true
      },
      inspect<T>(key: string) {
        return undefined
      },
      update(
        key: string,
        value: any,
        configurationTarget?: boolean | number,
      ): Promise<void> {
        return Promise.resolve()
      },
    }
  }

  export function onDidChangeConfiguration(listener: (e: any) => void): {
    dispose: () => void
  } {
    return { dispose: () => {} }
  }
}

export default {
  EventEmitter,
  CancellationTokenSource,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
  LanguageModelToolResultPart,
  LanguageModelChatMessage,
  LanguageModelChatMessageRole,
  LanguageModelChat,
  Memento,
  lm,
  window,
  env,
  workspace,
}
