// Model Manager Class
import * as vscode from 'vscode'
import { logger } from '../utils/logger'

/**
 * Model Manager Class
 * Manages access to VSCode Language Model API and model selection.
 */
class ModelManager {
  // VSCode ExtensionContext(for global state)
  private extensionContext: vscode.ExtensionContext | null = null

  /**
   * Validate and restore a model ID from globalState
   * @param key The globalState key
   * @param modelId The model ID to validate
   * @param setter The setter function to call if valid
   */
  private async validateAndRestoreModelId(
    key: string,
    modelId: string,
    setter: (id: string | null) => void,
  ): Promise<boolean> {
    try {
      // Check if model still exists
      const [model] = await vscode.lm.selectChatModels({ id: modelId })

      if (model) {
        // Model exists, restore it
        setter(modelId)
        logger.debug(`Restored model ${key}: ${modelId}`)
        return true
      }

      // Model not found, clear stale ID
      logger.warn(
        `Stored model ID "${modelId}" (${key}) is no longer available. Clearing selection.`,
      )
      setter(null)
      return false
    } catch (error) {
      // Error during validation, clear stale ID
      logger.warn(
        `Error validating model ID "${modelId}" (${key}): ${(error as Error).message}. Clearing selection.`,
      )
      setter(null)
      return false
    }
  }

  /**
   * Set ExtensionContext(for using global state)
   * Now async to validate stored model IDs at startup
   */
  public async setExtensionContext(
    context: vscode.ExtensionContext,
  ): Promise<void> {
    this.extensionContext = context

    // Validate and restore saved model IDs
    const results = await Promise.allSettled([
      // OpenAI model
      (async () => {
        const savedOpenAIModelId =
          context.globalState.get<string>('openaiModelId')
        if (savedOpenAIModelId) {
          return this.validateAndRestoreModelId(
            'openaiModelId',
            savedOpenAIModelId,
            id => this.setOpenAIModelId(id),
          )
        }
        return false
      })(),

      // Anthropic model
      (async () => {
        const savedAnthropicModelId =
          context.globalState.get<string>('anthropicModelId')
        if (savedAnthropicModelId) {
          return this.validateAndRestoreModelId(
            'anthropicModelId',
            savedAnthropicModelId,
            id => this.setAnthropicModelId(id),
          )
        }
        return false
      })(),

      // Claude Code Background model
      (async () => {
        const savedClaudeCodeBackgroundModelId =
          context.globalState.get<string>('claudeCodeBackgroundModelId')
        if (savedClaudeCodeBackgroundModelId) {
          return this.validateAndRestoreModelId(
            'claudeCodeBackgroundModelId',
            savedClaudeCodeBackgroundModelId,
            id => this.setClaudeCodeBackgroundModelId(id),
          )
        }
        return false
      })(),

      // Claude Code Thinking model
      (async () => {
        const savedClaudeCodeThinkingModelId = context.globalState.get<string>(
          'claudeCodeThinkingModelId',
        )
        if (savedClaudeCodeThinkingModelId) {
          return this.validateAndRestoreModelId(
            'claudeCodeThinkingModelId',
            savedClaudeCodeThinkingModelId,
            id => this.setClaudeCodeThinkingModelId(id),
          )
        }
        return false
      })(),
    ])

    // Log summary of restored models
    const restored = results.filter(
      r => r.status === 'fulfilled' && r.value === true,
    ).length
    const total = results.filter(r => r.status === 'fulfilled').length

    if (restored > 0) {
      logger.info(`Restored ${restored}/${total} stored model ID(s)`)
    }
  }
  // Currently selected OpenAI model ID
  private openaiModelId: string | null = null

  // Currently selected Anthropic model ID
  private anthropicModelId: string | null = null

  // Claude Code Background Model
  private claudeCodeBackgroundModelId: string | null = null

  // Claude Code Thinking Model
  private claudeCodeThinkingModelId: string | null = null

  // Supported model families
  private supportedFamilies = [
    'gpt-4o',
    'gpt-4o-mini',
    'o1',
    'o1-mini',
    'claude-3.5-sonnet',
  ]

  // OpenAIEvent emitter for model changes
  private readonly _onDidChangeOpenAIModelId = new vscode.EventEmitter<void>()
  public readonly onDidChangeOpenAIModelId =
    this._onDidChangeOpenAIModelId.event

  // AnthropicEvent emitter for model changes
  private readonly _onDidChangeAnthropicModelId =
    new vscode.EventEmitter<void>()
  public readonly onDidChangeAnthropicModelId =
    this._onDidChangeAnthropicModelId.event

  // Claude Code Background ModelEvent emitter for changes
  private readonly _onDidChangeClaudeCodeBackgroundModelId =
    new vscode.EventEmitter<void>()
  public readonly onDidChangeClaudeCodeBackgroundModelId =
    this._onDidChangeClaudeCodeBackgroundModelId.event

  // Claude Code Thinking ModelEvent emitter for changes
  private readonly _onDidChangeClaudeCodeThinkingModelId =
    new vscode.EventEmitter<void>()
  public readonly onDidChangeClaudeCodeThinkingModelId =
    this._onDidChangeClaudeCodeThinkingModelId.event

  /**
   * Select model from available models
   * @param provider API provider
   * @returns ID of selected model
   */
  public async selectModel(
    provider:
      | 'openAI'
      | 'anthropic'
      | 'claudeCodeBackground'
      | 'claudeCodeThinking',
  ): Promise<string | undefined> {
    try {
      // Try in order until a supported model is found
      let allModels: vscode.LanguageModelChat[] = []

      // First, try to get all models without specification
      const defaultModels = await vscode.lm.selectChatModels({})
      if (defaultModels && defaultModels.length > 0) {
        allModels = defaultModels
      } else {
        // If no models found, try by family
        for (const family of this.supportedFamilies) {
          const familyModels = await vscode.lm.selectChatModels({ family })
          if (familyModels && familyModels.length > 0) {
            allModels = [...allModels, ...familyModels]
          }
        }
      }

      if (allModels.length === 0) {
        vscode.window.showWarningMessage('No available models found')
        return undefined
      }

      // Create QuickPick items for model selection
      const quickPickItems = allModels.map(model => ({
        label: model.name,
        description: `${model.id} by ${model.vendor || 'Unknown vendor'}`,
        detail: `Max input tokens: ${model.maxInputTokens || 'Unknown'}, Version: ${model.version}`,
        model: model,
        // Add "Copy ID" text at right end
        buttons: [
          {
            iconPath: new vscode.ThemeIcon('copy'),
            tooltip: 'Copy model ID to clipboard',
          },
        ],
      }))

      // Let user select model using QuickPick
      const quickPick = vscode.window.createQuickPick()
      quickPick.items = quickPickItems
      quickPick.placeholder = 'Select a model to use'
      quickPick.matchOnDescription = true
      quickPick.matchOnDetail = true

      // button click eventhandlerset
      quickPick.onDidTriggerItemButton(event => {
        const modelId = (event.item as any).model.id
        vscode.env.clipboard.writeText(modelId)
        vscode.window.showInformationMessage(
          `Model ID "${modelId}" copied to clipboard`,
        )
      })

      // Show QuickPick
      quickPick.show()

      // Promisify and return result
      return new Promise<string | undefined>(resolve => {
        // Processing when model is selected
        quickPick.onDidAccept(() => {
          const selectedItem = quickPick.selectedItems[0] as any
          if (selectedItem) {
            // Branch save destination by provider
            let providerLabel = ''
            if (provider === 'openAI') {
              this.setOpenAIModelId(selectedItem.model.id)
              logger.info(`Selected OpenAI model: ${this.openaiModelId}`)
              providerLabel = 'OpenAI'
            } else if (provider === 'anthropic') {
              this.setAnthropicModelId(selectedItem.model.id)
              logger.info(`Selected Anthropic model: ${this.anthropicModelId}`)
              providerLabel = 'Anthropic'
            } else if (provider === 'claudeCodeBackground') {
              this.setClaudeCodeBackgroundModelId(selectedItem.model.id)
              logger.info(
                `Selected Claude Code Background model: ${this.claudeCodeBackgroundModelId}`,
              )
              providerLabel = 'Claude Code Background'
            } else if (provider === 'claudeCodeThinking') {
              this.setClaudeCodeThinkingModelId(selectedItem.model.id)
              logger.info(
                `Selected Claude Code Thinking model: ${this.claudeCodeThinkingModelId}`,
              )
              providerLabel = 'Claude Code Thinking'
            }

            // Notify model change
            vscode.window.showInformationMessage(
              `${providerLabel} model has been changed to "${selectedItem.model.name}".`,
            )

            // Close QuickPick and return selection result
            quickPick.dispose()
            resolve(selectedItem.model.id as string)
          } else {
            quickPick.dispose()
            resolve(undefined)
          }
        })

        // Processing when QuickPick is cancelled
        quickPick.onDidHide(() => {
          quickPick.dispose()
          resolve(undefined)
        })
      })
    } catch (error) {
      logger.error(
        `Model selection error: ${(error as Error).message}`,
        error as Error,
      )
      vscode.window.showErrorMessage(
        `Error selecting model: ${(error as Error).message}`,
      )
      return undefined
    }
  }

  /**
   * Get currently selected model ID
   * @returns Model ID
   */
  public getOpenAIModelId(): string | null {
    return this.openaiModelId
  }

  public getAnthropicModelId(): string | null {
    return this.anthropicModelId
  }

  public getClaudeCodeBackgroundModelId(): string | null {
    return this.claudeCodeBackgroundModelId
  }

  public getClaudeCodeThinkingModelId(): string | null {
    return this.claudeCodeThinkingModelId
  }

  /**
   * Set model ID directly
   * @param modelId Model ID to set, or null to clear
   */
  public setOpenAIModelId(modelId: string | null): void {
    this.openaiModelId = modelId
    // Persist (undefined clears the value in globalState)
    if (this.extensionContext) {
      this.extensionContext.globalState.update(
        'openaiModelId',
        modelId ?? undefined,
      )
    }
    // Fire OpenAI model change event
    this._onDidChangeOpenAIModelId.fire()
  }

  /**
   * Currently selected Anthropic model ID set and save
   * @param modelId Model ID to set, or null to clear
   */
  public setAnthropicModelId(modelId: string | null): void {
    this.anthropicModelId = modelId
    // Persist (undefined clears the value in globalState)
    if (this.extensionContext) {
      this.extensionContext.globalState.update(
        'anthropicModelId',
        modelId ?? undefined,
      )
    }
    // Fire event if needed
    this._onDidChangeAnthropicModelId.fire()
  }

  /**
   * Claude Code Background Model ID set and save
   * @param modelId Model ID to set, or null to clear
   */
  public setClaudeCodeBackgroundModelId(modelId: string | null): void {
    this.claudeCodeBackgroundModelId = modelId
    if (this.extensionContext) {
      this.extensionContext.globalState.update(
        'claudeCodeBackgroundModelId',
        modelId ?? undefined,
      )
    }
    this._onDidChangeClaudeCodeBackgroundModelId.fire()
  }

  /**
   * Claude Code Thinking Model ID set and save
   * @param modelId Model ID to set, or null to clear
   */
  public setClaudeCodeThinkingModelId(modelId: string | null): void {
    this.claudeCodeThinkingModelId = modelId
    if (this.extensionContext) {
      this.extensionContext.globalState.update(
        'claudeCodeThinkingModelId',
        modelId ?? undefined,
      )
    }
    this._onDidChangeClaudeCodeThinkingModelId.fire()
  }

  /**
   * Get default model
   * @returns Default model ID
   */
  public getDefaultModel(): string | null {
    return this.openaiModelId
  }

  /**
   * Get all available models
   * @returns VSCode LM API from raw retrieved model list
   */
  public async getAvailableModels(): Promise<vscode.LanguageModelChat[]> {
    try {
      // Get supported model
      let allModels: vscode.LanguageModelChat[] = []

      // First, get all models without specification
      const defaultModels = await vscode.lm.selectChatModels({})
      if (defaultModels && defaultModels.length > 0) {
        allModels = defaultModels
      } else {
        // If no models found, try by family
        for (const family of this.supportedFamilies) {
          const familyModels = await vscode.lm.selectChatModels({ family })
          if (familyModels && familyModels.length > 0) {
            allModels = [...allModels, ...familyModels]
          }
        }
      }

      return allModels
    } catch (error) {
      logger.error(
        `Get models error: ${(error as Error).message}`,
        error as Error,
      )
      throw error
    }
  }

  /**
   * Get specific model information
   * @param modelId Model ID
   * @returns VSCode LMmodel instanceor for proxy model case null
   */
  public async getModelInfo(
    modelId: string,
  ): Promise<vscode.LanguageModelChat | null> {
    try {
      // Special handling for vscode-lm-proxy
      if (modelId === 'vscode-lm-proxy') {
        return null // Proxy model VSCode LMdoes not have model instance
      }

      // Get model with specified ID
      const [model] = await vscode.lm.selectChatModels({ id: modelId })

      if (!model) {
        const error: any = new Error(`Model ${modelId} not found`)
        error.statusCode = 404
        error.type = 'model_not_found_error'
        throw error
      }

      return model
    } catch (error) {
      if ((error as any).statusCode === 404) {
        throw error
      }

      logger.error(
        `Get model info error: ${(error as Error).message}`,
        error as Error,
      )
      throw error
    }
  }
}

// Export singleton instance
export const modelManager = new ModelManager()
