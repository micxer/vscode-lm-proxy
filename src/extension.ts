// VSCode extension entry point
import * as vscode from 'vscode'
import { registerCommands } from './commands'
import { initializeLmApiHandler } from './server/handler'
import { serverManager } from './server/manager'
import { statusBarManager } from './ui/statusbar'
import { logger } from './utils/logger'

// Global variable to store extension context
let globalExtensionContext: vscode.ExtensionContext

// Global model manager variable
let modelManager: any

// Export function to get model manager
/**
 * Gets the model manager instance.
 * @returns {any} Model manager instance
 */
export function getModelManager() {
  return modelManager
}

/**
 * Entry point called when the VSCode extension is activated.
 * Initializes global variables, various managers, registers commands, monitors settings, and performs server auto-start.
 * @param {vscode.ExtensionContext} context Global context of the extension
 */
export async function activate(context: vscode.ExtensionContext) {
  // Store context in global variable
  globalExtensionContext = context

  // Import and initialize model management class (stored in global variable)
  // Using require inside activate to avoid circular dependencies
  modelManager = require('./model/manager').modelManager

  // Set ExtensionContext to model manager
  // This restores previously saved model information (now async with validation)
  try {
    await modelManager.setExtensionContext(context)
  } catch (error) {
    logger.warn(
      `Error during model validation at startup: ${(error as Error).message}`,
    )
    // Continue activation even if validation fails
  }

  // Set global state to LmApiHandler
  // Makes VSCode's global storage available to API handler
  initializeLmApiHandler(context.globalState)

  // Show output panel according to settings
  const config = vscode.workspace.getConfiguration('vscode-lm-proxy')
  const showOnStartup = config.get<boolean>('showOutputOnStartup', true)
  if (showOnStartup) {
    logger.show(true) // Keep focus on current editor
  }

  // Initialize context variable
  vscode.commands.executeCommand(
    'setContext',
    'vscode-lm-proxy.serverRunning',
    false,
  )

  // Initialize status bar
  statusBarManager.initialize(context)

  // Register commands
  registerCommands(context)

  // Monitor settings changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      // Prompt for server restart if port number changed while server is running
      if (
        e.affectsConfiguration('vscode-lm-proxy.port') &&
        serverManager.isRunning()
      ) {
        vscode.window.showInformationMessage(
          'Port number setting has been changed. Please restart the server to apply the change.',
        )
      }
    }),
  )

  // Restore state
  // Automatically restart if server was running previously
  const wasServerRunning = context.globalState.get<boolean>(
    'serverRunning',
    false,
  )
  if (wasServerRunning) {
    await serverManager.start().catch(err => {
      vscode.window.showErrorMessage(
        `Failed to auto-start server: ${err.message}`,
      )
    })

    const serverUrl = serverManager.getServerUrl()
    vscode.window.showInformationMessage(
      `Language Model Proxy server started (${serverUrl})`,
    )
  }

  // Log selected models and server status
  const openaiModel = modelManager.getOpenAIModelId() || 'Not selected'
  const anthropicModel = modelManager.getAnthropicModelId() || 'Not selected'
  const claudeCodeBackgroundModel =
    modelManager.getClaudeCodeBackgroundModelId() || 'Not selected'
  const claudeCodeThinkingModel =
    modelManager.getClaudeCodeThinkingModelId() || 'Not selected'
  const serverStatus = serverManager.isRunning() ? 'Running' : 'Stopped'
  logger.info('LM Proxy extension activated', {
    openaiModel,
    anthropicModel,
    claudeCodeBackgroundModel,
    claudeCodeThinkingModel,
    serverStatus,
  })
}

/**
 * Cleanup function called when the VSCode extension is deactivated.
 * Saves model information and server state, performs server shutdown.
 * @returns {Promise<void> | undefined} Promise when stopping server, undefined if not needed
 */
export function deactivate(): Promise<void> | undefined {
  logger.info('LM Proxy extension deactivated')

  // Save OpenAI model information (using model manager stored in global variable)
  const openaiModelId = modelManager.getOpenAIModelId()
  const anthropicModelId = modelManager.getAnthropicModelId()
  const claudeCodeBackgroundModelId =
    modelManager.getClaudeCodeBackgroundModelId()
  const claudeCodeThinkingModelId = modelManager.getClaudeCodeThinkingModelId()

  // Save model information and running state to global state
  globalExtensionContext.globalState.update('openaiModelId', openaiModelId)
  globalExtensionContext.globalState.update(
    'anthropicModelId',
    anthropicModelId,
  )
  globalExtensionContext.globalState.update(
    'claudeCodeBackgroundModelId',
    claudeCodeBackgroundModelId,
  )
  globalExtensionContext.globalState.update(
    'claudeCodeThinkingModelId',
    claudeCodeThinkingModelId,
  )
  globalExtensionContext.globalState.update(
    'serverRunning',
    serverManager.isRunning(),
  )

  // Stop server if running
  if (serverManager.isRunning()) {
    return serverManager.stop()
  }

  return undefined
}
