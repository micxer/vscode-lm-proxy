import type { PageResponse } from '@anthropic-ai/sdk/core/pagination'
import type {
  ErrorObject,
  Message,
  MessageCreateParams,
  MessageTokensCount,
  ModelInfo,
  RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources'
import type express from 'express'
import * as vscode from 'vscode'
import {
  convertAnthropicRequestToVSCodeRequest,
  convertVSCodeResponseToAnthropicResponse,
} from '../converter/anthropicConverter'
import { modelManager } from '../model/manager'
import { logger } from '../utils/logger'
import { getVSCodeModel } from './handler'

/**
 * Set up Anthropic-compatible Messages API endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupAnthropicMessagesEndpoints(app: express.Express): void {
  // Anthropic APIRegister compatible endpoints
  app.post('/anthropic/messages', (req, res) =>
    handleAnthropicMessages(req, res, 'anthropic'),
  )
  app.post('/anthropic/v1/messages', (req, res) =>
    handleAnthropicMessages(req, res, 'anthropic'),
  )
  app.post('/anthropic/v1/messages/count_tokens', (req, res) =>
    handleAnthropicCountTokens(req, res, 'anthropic'),
  )
}

/**
 * Set up Anthropic-compatible Models API endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupAnthropicModelsEndpoints(app: express.Express): void {
  // Model list endpoint
  app.get('/anthropic/models', handleAnthropicModels)
  app.get('/anthropic/v1/models', handleAnthropicModels)

  // Specific model information endpoint
  app.get('/anthropic/models/:model', handleAnthropicModelInfo)
  app.get('/anthropic/v1/models/:model', handleAnthropicModelInfo)
}

/**
 * Main function to process Anthropic-compatible Messages API requests.
 * - Request validation
 * - Get model
 * - LM API to Requestsend
 * - streaming/non-streamingResponseprocessing
 * - Error handling
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
export async function handleAnthropicMessages(
  req: express.Request,
  res: express.Response,
  provider: 'anthropic' | 'claude',
) {
  try {
    const body = req.body as MessageCreateParams
    logger.debug('Received request', { body })

    // required fields validation
    validateMessagesRequest(body)

    // Get model
    const { vsCodeModel } = await getVSCodeModel(body.model, provider)

    // streamingDetermine mode
    const isStreaming = body.stream === true

    //AnthropicRequest to VSCode LM APIformat conversion
    const { messages, options, inputTokens } =
      await convertAnthropicRequestToVSCodeRequest(body, vsCodeModel)

    // Cancellation tokencreate
    const cancellationToken = new vscode.CancellationTokenSource().token

    // LM API to Requestsend
    const response = await vsCodeModel.sendRequest(
      messages,
      options,
      cancellationToken,
    )
    logger.debug('Received response from LM API')

    // ResponseAnthropicformat
    const anthropicResponse = convertVSCodeResponseToAnthropicResponse(
      response,
      vsCodeModel,
      isStreaming,
      inputTokens,
    )
    logger.debug('anthropicResponse', {
      anthropicResponse,
      vsCodeModel,
      isStreaming,
    })

    // streamingResponseprocessing
    if (isStreaming) {
      await handleStreamingResponse(
        res,
        anthropicResponse as AsyncIterable<RawMessageStreamEvent>,
        req.originalUrl || req.url,
      )
      return
    }

    // non-streamingResponseprocessing
    const message = await (anthropicResponse as Promise<Message>)
    logger.debug('message', { message })
    res.json(message)
  } catch (error) {
    const { statusCode, errorObject } = handleMessageError(
      error as vscode.LanguageModelError,
    )
    res.status(statusCode).json({ type: 'error', error: errorObject })
  }
}

/**
 * Messages API request required fieldsvalidation
 * @param {MessageCreateParams} body
 * @throws Error when throw exception
 */
function validateMessagesRequest(body: MessageCreateParams) {
  // messagesfield exists and array check
  if (
    !body.messages ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0
  ) {
    const error: vscode.LanguageModelError = {
      ...new Error('The messages field is required'),
      name: 'InvalidMessageRequest',
      code: 'invalid_request_error',
    }
    throw error
  }

  // modelfield existscheck
  if (!body.model) {
    const error: vscode.LanguageModelError = {
      ...new Error('The model field is required'),
      name: 'InvalidModelRequest',
      code: 'not_found_error',
    }
    throw error
  }
}

/**
 * streamingResponseprocessingclient to send
 * @param {express.Response} res
 * @param {AsyncIterable<RawMessageStreamEvent>} stream
 * @param {string} reqPath
 * @returns {Promise<void>}
 */
async function handleStreamingResponse(
  res: express.Response,
  stream: AsyncIterable<RawMessageStreamEvent>,
  reqPath: string,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  logger.debug('Streaming started', { path: reqPath })
  let chunkIndex = 0

  try {
    // streamingSend response sequentially
    for await (const chunk of stream) {
      const data = JSON.stringify(chunk)
      res.write(`data: ${data}\n\n`)
      logger.debug(`Streaming chunk: ${data}`)
      chunkIndex++
    }

    // Normal end
    logger.debug('Streaming ended', {
      path: reqPath,
      chunkCount: chunkIndex,
    })
  } catch (error) {
    // On error, Anthropic-compatible error,send and end stream
    const { errorObject } = handleMessageError(
      error as vscode.LanguageModelError,
    )
    res.write(
      `data: ${JSON.stringify({ type: 'error', error: errorObject })}\n\n`,
    )
    logger.error('Streaming error', { error, path: reqPath })
  } finally {
    // streamend
    res.end()
  }
}

/**
 * VSCode LanguageModelError Anthropic compatibleerror formatConverts and log
 * @param {vscode.LanguageModelError} error
 * @returns { statusCode: number, errorObject: ErrorObject }
 */
function handleMessageError(error: vscode.LanguageModelError): {
  statusCode: number
  errorObject: ErrorObject
} {
  logger.error('VSCode LM API error', error, {
    cause: error.cause,
    code: error.code,
    message: error.message,
    name: error.name,
    stack: error.stack,
  })

  // variablesdefined
  let statusCode = 500
  let type: ErrorObject['type'] = 'api_error'
  let message = error.message || 'An unknown error has occurred'

  // LanguageModelError.name according tomapping
  switch (error.name) {
    case 'InvalidMessageFormat':
    case 'InvalidModel':
      statusCode = 400
      type = 'invalid_request_error'
      break
    case 'NoPermissions':
      statusCode = 403
      type = 'permission_error'
      break
    case 'Blocked':
      statusCode = 403
      type = 'permission_error'
      break
    case 'NotFound':
      statusCode = 404
      type = 'not_found_error'
      break
    case 'ChatQuotaExceeded':
      statusCode = 429
      type = 'rate_limit_error'
      break
    case 'Error': {
      // Extract error code and JSON part, store in variables
      const match = error.message.match(/Request Failed: (\d+)\s+({.*})/)

      if (match) {
        const status = Number(match[1])
        const jsonString = match[2]
        const errorJson = JSON.parse(jsonString)
        logger.debug('Parsed error from VSCode LM API', {
          status,
          errorJson,
        })

        statusCode = status
        type = errorJson.error.type
        message = errorJson.error.message
      }

      break
    }
    case 'Unknown':
      statusCode = 500
      type = 'api_error'
      break
  }

  // Anthropic-compatibleerror format , return
  const errorObject: ErrorObject = {
    type,
    message,
  }

  return { statusCode, errorObject }
}

/**
 * Anthropic-compatible model listRequestprocess
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
export async function handleAnthropicModels(
  _req: express.Request,
  res: express.Response,
) {
  try {
    // Get available model
    const availableModels = await modelManager.getAvailableModels()

    // Anthropic APIformat
    const now = Math.floor(Date.now() / 1000)
    const modelsData: ModelInfo[] = availableModels.map(model => ({
      created_at: now.toString(),
      display_name: model.name,
      id: model.id,
      type: 'model',
    }))

    // Also add proxy model ID
    modelsData.push({
      created_at: now.toString(),
      display_name: 'VSCode LM Proxy',
      id: 'vscode-lm-proxy',
      type: 'model',
    })

    const anthropicModelsResponse: PageResponse<ModelInfo> = {
      data: modelsData,
      first_id: modelsData[0].id,
      has_more: false,
      last_id: modelsData[modelsData.length - 1].id,
    }

    res.json(anthropicModelsResponse)
  } catch (error: any) {
    logger.error(`Anthropic Models API error: ${error.message}`, error as Error)

    // Error response create
    const statusCode = error.statusCode || 500
    const errorResponse = {
      type: 'error',
      error: {
        message: error.message || 'An unknown error has occurred',
        type: error.type || 'api_error',
      } as ErrorObject,
    }

    res.status(statusCode).json(errorResponse)
  }
}

/**
 * Anthropic-compatible token count API requestprocess
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @param {string} provider Provider ('anthropic' | 'claude')
 * @returns {Promise<void>}
 */
export async function handleAnthropicCountTokens(
  req: express.Request,
  res: express.Response,
  provider: 'anthropic' | 'claude',
) {
  try {
    const body = req.body as MessageCreateParams
    logger.debug('Received count_tokens request', { body })

    // VSCodeGet model
    const { vsCodeModel } = await getVSCodeModel(body.model, provider)

    // Target textdefined
    let inputTokens = 0

    // messages
    for (const message of body.messages) {
      // role
      inputTokens += await vsCodeModel.countTokens(message.role)

      // content
      if (typeof message.content === 'string') {
        inputTokens += await vsCodeModel.countTokens(message.content)
      } else {
        const content = message.content
          .map(part => JSON.stringify(part))
          .join(' ')
        inputTokens += await vsCodeModel.countTokens(content)
      }
    }

    // system
    if (body.system) {
      if (typeof body.system === 'string') {
        inputTokens += await vsCodeModel.countTokens(body.system)
      } else {
        const text = body.system.map(part => part.text).join(' ')
        inputTokens += await vsCodeModel.countTokens(text)
      }
    }

    // tools
    if (body.tools) {
      for (const tool of body.tools) {
        // name
        inputTokens += await vsCodeModel.countTokens(tool.name)

        // description
        if ('description' in tool && tool.description) {
          inputTokens += await vsCodeModel.countTokens(tool.description)
        }

        // input_schema
        if ('input_schema' in tool) {
          const inputSchema = JSON.stringify(tool.input_schema)
          inputTokens += await vsCodeModel.countTokens(inputSchema)
        }
      }
    }

    // Responsecreate object
    const messageTokenCount: MessageTokensCount = {
      input_tokens: inputTokens,
    }
    logger.debug({ messageTokenCount })

    // Responsereturn
    res.json(messageTokenCount)
  } catch (error) {
    const { statusCode, errorObject } = handleMessageError(
      error as vscode.LanguageModelError,
    )
    res.status(statusCode).json({ type: 'error', error: errorObject })
  }
}

/**
 * Anthropic-compatible single model informationRequestprocess
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
export async function handleAnthropicModelInfo(
  req: express.Request,
  res: express.Response,
) {
  try {
    const modelId = req.params.model

    if (modelId === 'vscode-lm-proxy') {
      // vscode-lm-proxy case, return fixed information
      const anthropicModel: ModelInfo = {
        created_at: Math.floor(Date.now() / 1000).toString(),
        display_name: 'VSCode LM Proxy',
        id: 'vscode-lm-proxy',
        type: 'model',
      }
      res.json(anthropicModel)
      return
    }

    // LM API from model informationget
    const vsCodeModel = await modelManager.getModelInfo(modelId)

    // If model does not exist throw error
    if (!vsCodeModel) {
      throw {
        ...new Error(`Model ${modelId} not found`),
        statusCode: 404,
        type: 'not_found_error',
      }
    }

    // Anthropic APIformat
    const anthropicModel: ModelInfo = {
      created_at: Math.floor(Date.now() / 1000).toString(),
      display_name: vsCodeModel.name,
      id: vsCodeModel.id,
      type: 'model',
    }

    // Responsereturn
    res.json(anthropicModel)
  } catch (error: any) {
    logger.error(
      `Anthropic Model Info API error: ${error.message}`,
      error as Error,
    )

    // Error response create
    const statusCode = error.statusCode || 500
    const errorResponse = {
      type: 'error',
      error: {
        message: error.message || 'An unknown error has occurred',
        type: error.type || 'api_error',
      } as ErrorObject,
    }

    res.status(statusCode).json(errorResponse)
  }
}
