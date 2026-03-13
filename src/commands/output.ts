// Output panel related commands
import * as vscode from 'vscode'
import { logger } from '../utils/logger'

/**
 * Output panel related commandsVSCode register
 * @param {vscode.ExtensionContext} context Extension global context
 */
export function registerOutputCommands(context: vscode.ExtensionContext): void {
  // Show output panel command
  const showOutputCommand = vscode.commands.registerCommand(
    'vscode-lm-proxy.showOutput',
    () => {
      logger.show(false) // Move focus to output panel
      logger.info('Output panel displayed')
    },
  )

  // Clear output panel command
  const clearOutputCommand = vscode.commands.registerCommand(
    'vscode-lm-proxy.clearOutput',
    () => {
      logger.clear()
      logger.info('Output panel cleared')
    },
  )

  // log levelQuickPick to select and set command
  const setLogLevelCommand = vscode.commands.registerCommand(
    'vscode-lm-proxy.setLogLevel',
    async () => {
      const config = vscode.workspace.getConfiguration('vscode-lm-proxy')
      const logLevels = [
        {
          label: 'DEBUG',
          description: 'Show detailed request/response logs',
          value: 0,
        },
        {
          label: 'INFO',
          description: 'Show basic request/response logs',
          value: 1,
        },
        {
          label: 'WARN',
          description: 'Show only warnings and errors',
          value: 2,
        },
        { label: 'ERROR', description: 'Show only errors', value: 3 },
      ]
      const selected = await vscode.window.showQuickPick(logLevels, {
        placeHolder: 'Select log level',
      })
      if (selected) {
        await config.update(
          'logLevel',
          selected.value,
          vscode.ConfigurationTarget.Global,
        )
        logger.show(false)
      }
    },
  )

  // Register to context
  context.subscriptions.push(
    showOutputCommand,
    clearOutputCommand,
    setLogLevelCommand,
  )
}
