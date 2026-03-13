import type express from 'express'
import type { APIError } from 'openai'
import type { PageResponse } from 'openai/pagination'
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  Model,
} from 'openai/resources'
import * as vscode from 'vscode'
import {
  convertOpenAIRequestToVSCodeRequest,
  convertVSCodeResponseToOpenAIResponse,
} from '../converter/openaiConverter'
import { modelManager } from '../model/manager'
import { logger } from '../utils/logger'
import { getVSCodeModel } from './handler'

/**
 * Set up OpenAI-compatible Chat Completions API endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupOpenAIChatCompletionsEndpoints(
  app: express.Express,
): void {
  // OpenAI APIRegister compatible endpoints
  app.post('/openai/chat/completions', handleOpenAIChatCompletions)
  app.post('/openai/v1/chat/completions', handleOpenAIChatCompletions)
}

/**
 * Set up OpenAI-compatible Models API endpoints
 * @param {express.Express} app Express.js application
 * @returns {void}
 */
export function setupOpenAIModelsEndpoints(app: express.Express): void {
  // Model list endpoint
  app.get('/openai/models', handleOpenAIModels)
  app.get('/openai/v1/models', handleOpenAIModels)

  // Specific model information endpoint
  app.get('/openai/models/:model', handleOpenAIModelInfo)
  app.get('/openai/v1/models/:model', handleOpenAIModelInfo)
}

/**
 * Main function to process OpenAI-compatible Chat Completions API requests.
 * - Request validation
 * - Get model
 * - LM API to Requestsend
 * - streaming/non-streamingResponseprocessing
 * - Error handling
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
async function handleOpenAIChatCompletions(
  req: express.Request,
  res: express.Response,
) {
  try {
    const body = req.body as ChatCompletionCreateParams
    logger.debug('Received request', { body })

    // required fields validation
    validateChatCompletionRequest(body)

    // Get model
    const { vsCodeModel } = await getVSCodeModel(body.model, 'openai')

    // streamingDetermine mode
    const isStreaming = body.stream === true

    // OpenAIRequest to VSCode LM APIformat conversion
    const { messages, options, inputTokens } =
      await convertOpenAIRequestToVSCodeRequest(body, vsCodeModel)

    // Cancellation tokencreate
    const cancellationToken = new vscode.CancellationTokenSource().token

    // LM API to Requestsend
    const response = await vsCodeModel.sendRequest(
      messages,
      options,
      cancellationToken,
    )
    logger.debug('Received response from LM API')

    // ResponseOpenAIformat
    const openAIResponse = convertVSCodeResponseToOpenAIResponse(
      response,
      vsCodeModel,
      isStreaming,
      inputTokens,
    )
    logger.debug('openAIResponse', {
      openAIResponse,
      vsCodeModel,
      isStreaming,
    })

    // streamingResponseprocessing
    if (isStreaming) {
      await handleStreamingResponse(
        res,
        openAIResponse as AsyncIterable<ChatCompletionChunk>,
        req.originalUrl || req.url,
      )
      return
    }

    // non-streamingResponseprocessing
    const completion = await (openAIResponse as Promise<ChatCompletion>)
    logger.debug('completion', { completion })
    res.json(completion)
  } catch (error) {
    const { statusCode, apiError } = handleChatCompletionError(
      error as vscode.LanguageModelError,
    )
    res.status(statusCode).json({ error: apiError })
  }
}

/**
 * Chat Completions API request required fieldsvalidation
 * @param {ChatCompletionCreateParams} body
 * @throws Error when throw exception
 */
function validateChatCompletionRequest(body: ChatCompletionCreateParams) {
  // messagesfield exists and array check
  if (
    !body.messages ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0
  ) {
    const error: vscode.LanguageModelError = {
      ...new Error('The messages field is required'),
      name: 'InvalidMessageRequest',
      code: 'invalid_message_format',
    }
    throw error
  }

  // modelfield existscheck
  if (!body.model) {
    const error: vscode.LanguageModelError = {
      ...new Error('The model field is required'),
      name: 'InvalidModelRequest',
      code: 'invalid_model',
    }
    throw error
  }
}

/**
 * streamingResponseprocessingclient to send
 * @param {express.Response} res
 * @param {AsyncIterable<ChatCompletionChunk>} stream
 * @param {string} reqPath
 * @returns {Promise<void>}
 */
async function handleStreamingResponse(
  res: express.Response,
  stream: AsyncIterable<ChatCompletionChunk>,
  reqPath: string,
) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  logger.debug('Streaming started', { stream: 'start', path: reqPath })
  let chunkIndex = 0

  try {
    // streamingSend response sequentially
    for await (const chunk of stream) {
      const data = JSON.stringify(chunk)
      res.write(`data: ${data}\n\n`)
      logger.debug(
        `Streaming chunk: ${JSON.stringify({ stream: 'chunk', chunk, index: chunkIndex++ })}`,
      )
    }

    // Normal end
    res.write('data: [DONE]\n\n')
    logger.debug('Streaming ended', {
      stream: 'end',
      path: reqPath,
      chunkCount: chunkIndex,
    })
  } catch (error) {
    // On error, OpenAI-compatible error,send and end stream
    const { apiError } = handleChatCompletionError(
      error as vscode.LanguageModelError,
    )
    res.write(`data: ${JSON.stringify({ error: apiError })}\n\n`)
    res.write('data: [DONE]\n\n')
    logger.error('Streaming error', { error, path: reqPath })
  } finally {
    // streamend
    res.end()
  }
}

/**
 * VSCode LanguageModelError OpenAI API compatibleerror formatConverts and log
 * @param {vscode.LanguageModelError} error
 * @returns { statusCode: number, apiError: APIError }
 */
function handleChatCompletionError(error: vscode.LanguageModelError): {
  statusCode: number
  apiError: APIError
} {
  logger.error('VSCode LM API error', {
    cause: error.cause,
    code: error.code,
    message: error.message,
    name: error.name,
    stack: error.stack,
  })

  // variablesdefined
  let statusCode = 500
  let type = 'api_error'
  let code = error.code || 'internal_error'
  let param: string | null = null

  // LanguageModelError.name according tomapping
  switch (error.name) {
    case 'InvalidMessageFormat':
    case 'InvalidModel':
      statusCode = 400
      type = 'invalid_request_error'
      code =
        error.name === 'InvalidMessageFormat'
          ? 'invalid_message_format'
          : 'invalid_model'
      break
    case 'NoPermissions':
      statusCode = 403
      type = 'access_terminated'
      code = 'access_terminated'
      break
    case 'Blocked':
      statusCode = 403
      type = 'blocked'
      code = 'blocked'
      break
    case 'NotFound':
      statusCode = 404
      type = 'not_found_error'
      code = 'model_not_found'
      param = 'model'
      break
    case 'ChatQuotaExceeded':
      statusCode = 429
      type = 'insufficient_quota'
      code = 'quota_exceeded'
      break
    case 'Unknown':
      statusCode = 500
      type = 'server_error'
      code = 'internal_server_error'
      break
  }

  // OpenAI-compatibleerror format , return
  const apiError: APIError = {
    code,
    message: error.message || 'An unknown error has occurred',
    type,
    status: statusCode,
    headers: undefined,
    error: undefined,
    param,
    requestID: undefined,
    name: error.name || 'LanguageModelError',
  }
  logger.error(`OpenAI API error: ${apiError.message}`, apiError)

  return { statusCode, apiError }
}

/**
 * OpenAI-compatible model listRequestprocess
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
async function handleOpenAIModels(
  _req: express.Request,
  res: express.Response,
) {
  try {
    // Get available model
    const availableModels = await modelManager.getAvailableModels()

    // OpenAI APIformat
    const now = Math.floor(Date.now() / 1000)
    const modelsData: Model[] = availableModels.map(model => ({
      id: model.id,
      object: 'model',
      created: now,
      owned_by: model.vendor || 'vscode',
    }))

    // Also add proxy model ID
    modelsData.push({
      id: 'vscode-lm-proxy',
      object: 'model',
      created: now,
      owned_by: 'vscode-lm-proxy',
    })

    const openAIModelsResponse: PageResponse<Model> = {
      object: 'list',
      data: modelsData,
    }

    res.json(openAIModelsResponse)
  } catch (error: any) {
    logger.error(`OpenAI Models API error: ${error.message}`, error as Error)

    // Error response create
    const statusCode = error.statusCode || 500
    const errorResponse = {
      error: {
        message: error.message || 'An unknown error has occurred',
        type: error.type || 'api_error',
        code: error.code || 'internal_error',
      },
    }

    res.status(statusCode).json(errorResponse)
  }
}

/**
 * OpenAI-compatible single model informationRequestprocess
 * @param {express.Request} req Request
 * @param {express.Response} res Response
 * @returns {Promise<void>}
 */
async function handleOpenAIModelInfo(
  req: express.Request,
  res: express.Response,
) {
  try {
    const modelId = req.params.model

    if (modelId === 'vscode-lm-proxy') {
      // vscode-lm-proxy case, return fixed information
      const now = Math.floor(Date.now() / 1000)
      const openAIModel: Model = {
        id: 'vscode-lm-proxy',
        object: 'model',
        created: now,
        owned_by: 'vscode-lm-proxy',
      }
      res.json(openAIModel)
      return
    }

    // LM API from model informationget
    const vsCodeModel = await modelManager.getModelInfo(modelId)

    // If model does not exist throw error
    if (!vsCodeModel) {
      throw {
        ...new Error(`Model ${modelId} not found`),
        statusCode: 404,
        type: 'model_not_found_error',
      }
    }

    // OpenAI APIformat
    const openAIModel: Model = {
      id: vsCodeModel.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: vsCodeModel.vendor || 'vscode',
    }

    // Responsereturn
    res.json(openAIModel)
  } catch (error: any) {
    logger.error(
      `OpenAI Model info API error: ${error.message}`,
      error as Error,
    )

    // Error response create
    const statusCode = error.statusCode || 500
    const errorResponse = {
      error: {
        message: error.message || 'An unknown error has occurred',
        type: error.type || 'api_error',
        code: error.code || 'internal_error',
      },
    }

    res.status(statusCode).json(errorResponse)
  }
}
