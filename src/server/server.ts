// Express.js server configuration and API endpoint implementation
import express from 'express'
import * as vscode from 'vscode'
import { logger } from '../utils/logger'
import {
  setupAnthropicMessagesEndpoints,
  setupAnthropicModelsEndpoints,
} from './anthropicHandler'
import {
  setupClaudeCodeMessagesEndpoints,
  setupClaudeCodeModelsEndpoints,
} from './claudeCodeHandler'
import { setupStatusEndpoint } from './handler'
import {
  setupOpenAIChatCompletionsEndpoints,
  setupOpenAIModelsEndpoints,
} from './openaiHandler'

/**
 * Creates an Express.js server instance.
 * Sets up routing including OpenAI-compatible API and status endpoints.
 * @returns {express.Express} Configured Express application
 */
export function createServer(): express.Express {
  const app = express()
  const config = vscode.workspace.getConfiguration('vscode-lm-proxy')

  // JSON parsing configuration (limited to 10MB for security)
  app.use(express.json({ limit: '10mb' }))

  // CORS protection middleware
  const enableCORS = config.get<boolean>('enableCORS', false)
  app.use((req, res, next) => {
    if (enableCORS) {
      // When CORS is enabled (recommended for development only)
      const origin = req.headers.origin
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key')
        res.setHeader('Access-Control-Allow-Credentials', 'true')
      }

      // Handle OPTIONS requests (preflight)
      if (req.method === 'OPTIONS') {
        res.status(200).end()
        return
      }
    } else {
      // CORS disabled (default: reject all origins for security)
      res.setHeader('Access-Control-Allow-Origin', 'null')
    }
    next()
  })

  // Authentication middleware (except status endpoint)
  const apiKey = config.get<string>('apiKey', '')
  if (apiKey) {
    app.use((req, res, next) => {
      // Root path (status endpoint) does not require authentication
      if (req.path === '/') {
        return next()
      }

      // Authenticate with X-API-Key header or Authorization header
      const requestKey =
        req.headers['x-api-key'] ||
        (req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : null)

      if (requestKey !== apiKey) {
        logger.warn('Unauthorized access attempt', {
          path: req.path,
          ip: req.ip,
          headers: {
            'user-agent': req.headers['user-agent'],
            origin: req.headers.origin,
          },
        })
        return res.status(401).json({
          error: {
            message: 'Unauthorized: Invalid or missing API key',
            type: 'authentication_error',
            code: 'invalid_api_key',
          },
        })
      }

      next()
    })
    logger.info('API key authentication enabled')
  } else {
    logger.warn(
      'WARNING: API key authentication is DISABLED. Your server is accessible to anyone on your network. Set "vscode-lm-proxy.apiKey" in settings to secure your server.',
    )
  }

  // Request/response logging middleware
  app.use((req, res, next) => {
    const startTime = Date.now()
    const path = req.originalUrl || req.url

    res.on('finish', () => {
      const responseTime = Date.now() - startTime
      // Body is omitted as needed (body cannot be retrieved here with Express standard)
      logger.debug('Response sent', {
        status: res.statusCode,
        path,
        responseTime,
      })
    })

    next()
  })

  // Setup server status endpoint
  setupStatusEndpoint(app)

  // Setup OpenAI-compatible endpoints
  setupOpenAIChatCompletionsEndpoints(app)
  setupOpenAIModelsEndpoints(app)

  // Setup Anthropic-compatible API endpoints
  setupAnthropicMessagesEndpoints(app)
  setupAnthropicModelsEndpoints(app)

  // Setup ClaudeCode-compatible API endpoints
  setupClaudeCodeMessagesEndpoints(app)
  setupClaudeCodeModelsEndpoints(app)

  // Setup error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error('Server error:', err)
      res.status(500).json({
        error: {
          message: `Internal Server Error: ${err.message}`,
          type: 'server_error',
        },
      })
    },
  )

  return app
}
