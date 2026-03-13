import type {
  Chat,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
} from 'openai/resources'
import * as vscode from 'vscode'
import { isTextPart, isToolCallPart } from '../server/handler'
import { generateRandomId } from '../utils'
import { logger } from '../utils/logger'

/**
 * Converts OpenAI API ChatCompletionCreateParams request to VSCode extension API chat request format.
 * Maps OpenAI messages, tools, tool_choice, etc. to VSCode types, and
 * parameters not supported by VSCode API are consolidated into modelOptions for future extensibility.
 * OpenAIproprietary role and toolspecifications, etc., between APIs specification differences to absorb conversion logic includes
 * @param {ChatCompletionCreateParams} openaiRequest OpenAI chat request parameters
 * @param {vscode.LanguageModelChat} vsCodeModel VSCode LanguageModelChatinstance
 * @returns {{ messages: vscode.LanguageModelChatMessage[], options: vscode.LanguageModelChatRequestOptions }}
 * VSCodeextensionAPIfor chat message array and options
 */
export async function convertOpenAIRequestToVSCodeRequest(
  openaiRequest: ChatCompletionCreateParams,
  vsCodeModel: vscode.LanguageModelChat,
): Promise<{
  messages: vscode.LanguageModelChatMessage[]
  options: vscode.LanguageModelChatRequestOptions
  inputTokens: number
}> {
  logger.debug('Converting OpenAI request to VSCode request')

  // OpenAI messagesVSCode LanguageModelChatMessage[]Convert to
  const messages: vscode.LanguageModelChatMessage[] =
    openaiRequest.messages.map(msg => {
      let role: vscode.LanguageModelChatMessageRole
      let content:
        | string
        | Array<
            | vscode.LanguageModelTextPart
            | vscode.LanguageModelToolResultPart
            | vscode.LanguageModelToolCallPart
          > = ''
      let prefix = ''
      let name = 'Assistant'

      // Role conversion
      switch (msg.role) {
        case 'user':
          role = vscode.LanguageModelChatMessageRole.User
          name = 'User'
          break
        case 'assistant':
          role = vscode.LanguageModelChatMessageRole.Assistant
          name = 'Assistant'
          break
        case 'developer':
          role = vscode.LanguageModelChatMessageRole.Assistant
          prefix = '[DEVELOPER] '
          name = 'Developer'
          break
        case 'system':
          role = vscode.LanguageModelChatMessageRole.Assistant
          prefix = '[SYSTEM] '
          name = 'System'
          break
        case 'tool':
          role = vscode.LanguageModelChatMessageRole.Assistant
          prefix = '[TOOL] '
          name = 'Tool'
          break
        case 'function':
          role = vscode.LanguageModelChatMessageRole.Assistant
          prefix = '[FUNCTION] '
          name = 'Function'
          break
      }

      // Convert content
      if (typeof msg.content === 'string') {
        content = prefix + msg.content
      } else if (Array.isArray(msg.content)) {
        content = msg.content.map(c => {
          switch (c.type) {
            case 'text':
              return new vscode.LanguageModelTextPart(c.text)
            case 'image_url':
              return new vscode.LanguageModelTextPart(
                `[Image URL]: ${JSON.stringify(c.image_url)}`,
              )
            case 'input_audio':
              return new vscode.LanguageModelTextPart(
                `[Input Audio]: ${JSON.stringify(c.input_audio)}`,
              )
            case 'file':
              return new vscode.LanguageModelTextPart(
                `[File]: ${JSON.stringify(c.file)}`,
              )
            case 'refusal':
              return new vscode.LanguageModelTextPart(`[Refusal]: ${c.refusal}`)
          }
        })
      }

      return new vscode.LanguageModelChatMessage(role, content, name)
    })

  // --- Calculate input tokens ---
  let inputTokens = 0
  for (const msg of messages) {
    inputTokens += await vsCodeModel.countTokens(msg)
  }

  // --- Generate options ---
  const options: vscode.LanguageModelChatRequestOptions = {}

  // Convert tool_choice
  if (
    'tool_choice' in openaiRequest &&
    openaiRequest.tool_choice !== undefined
  ) {
    const tc = openaiRequest.tool_choice
    if (typeof tc === 'string') {
      // 'auto' | 'required' | 'none' case
      switch (tc) {
        case 'auto':
          options.toolMode = vscode.LanguageModelChatToolMode.Auto
          break
        case 'required':
          options.toolMode = vscode.LanguageModelChatToolMode.Required
          break
        case 'none':
          // VSCode API Off/None does not exist, use Auto fallback
          options.toolMode = vscode.LanguageModelChatToolMode.Auto
          break
      }
    } else {
      // 'function' case
      options.toolMode = vscode.LanguageModelChatToolMode.Auto
    }
  }

  // Convert tools
  if ('tools' in openaiRequest && Array.isArray(openaiRequest.tools)) {
    options.tools = openaiRequest.tools.map(tool => {
      const base = {
        name: tool.function.name,
        description: tool.function.description ?? '',
      }
      return tool.function.parameters !== undefined
        ? { ...base, inputSchema: tool.function.parameters }
        : base
    })
  }

  // Pass other parameters consolidated in modelOptions
  const modelOptions: { [name: string]: any } = {}
  const modelOptionKeys = [
    'audio',
    'frequency_penalty',
    'function_call',
    'functions',
    'logit_bias',
    'logprobs',
    'max_completion_tokens',
    'max_tokens',
    'metadata',
    'modalities',
    'n',
    'parallel_tool_calls',
    'prediction',
    'presence_penalty',
    'reasoning_effort',
    'response_format',
    'seed',
    'service_tier',
    'stop',
    'store',
    'stream',
    'stream_options',
    'temperature',
    'top_logprobs',
    'top_p',
    'user',
    'web_search_options',
  ]

  // --- other optionsmodelOptions add ---
  for (const key of modelOptionKeys) {
    if (key in openaiRequest && (openaiRequest as any)[key] !== undefined) {
      modelOptions[key] = (openaiRequest as any)[key]
    }
  }
  if (Object.keys(modelOptions).length > 0) {
    options.modelOptions = modelOptions
  }

  // --- convertresultand log ---
  logger.debug('Converted OpenAI request to VSCode request', {
    messages,
    options,
    inputTokens,
  })

  return { messages, options, inputTokens }
}

/**
 * VSCode LanguageModelChatResponseOpenAI ChatCompletionorChatCompletionChunkformatConverts
 * For streaming ChatCompletionChunk AsyncIterable, returns
 * For non-streaming full textChatCompletionformat
 * @param vscodeResponse VSCode LanguageModelChatResponse
 * @param vsCodeModel VSCode LanguageModelChatinstance
 * @param isStreaming streamingwhether
 * @param inputTokens input token count
 * @returns ChatCompletion or AsyncIterable<ChatCompletionChunk>
 */
export function convertVSCodeResponseToOpenAIResponse(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  isStreaming: boolean,
  inputTokens: number,
): Promise<ChatCompletion> | AsyncIterable<ChatCompletionChunk> {
  // For streaming
  if (isStreaming) {
    // ChatCompletionChunk AsyncIterablereturn
    return convertVSCodeStreamToOpenAIChunks(
      vscodeResponse.stream,
      vsCodeModel,
      inputTokens,
    )
  }
  // For non-streaming
  // full textOpenAI ChatCompletionConvert to
  return convertVSCodeTextToOpenAICompletion(
    vscodeResponse,
    vsCodeModel,
    inputTokens,
  )
}

/**
 * VSCode streamOpenAI ChatCompletionChunkto AsyncIterable
 * @param stream VSCode stream
 * @param vsCodeModel VSCode LanguageModelChatinstance
 * @param inputTokens input token count
 * @returns AsyncIterable<ChatCompletionChunk>
 */
async function* convertVSCodeStreamToOpenAIChunks(
  stream: AsyncIterable<
    vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart | unknown
  >,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
): AsyncIterable<ChatCompletionChunk> {
  // Generate chunk ID and timestamp
  const randomId = `chatcmpl-${generateRandomId()}`
  const created = Math.floor(Date.now() / 1000)

  let isRoleSent = false
  let toolCallIndex = 0
  let isToolCalled = false // whether tool_call appeared

  let outputTokens = 0 // output token count

  // streaming chunksgenerate
  for await (const part of stream) {
    // Initialize chunk
    const chunk: ChatCompletionChunk = {
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: null,
        },
      ],
      created,
      id: randomId,
      model: vsCodeModel.id,
      object: 'chat.completion.chunk',
      service_tier: undefined,
      system_fingerprint: undefined,
      usage: {
        completion_tokens: 0,
        prompt_tokens: 0,
        total_tokens: 0,
        completion_tokens_details: {
          accepted_prediction_tokens: 0,
          audio_tokens: 0,
          reasoning_tokens: 0,
          rejected_prediction_tokens: 0,
        },
        prompt_tokens_details: {
          audio_tokens: 0,
          cached_tokens: 0,
        },
      },
    }

    // For text part
    if (isTextPart(part)) {
      if (!isRoleSent) {
        chunk.choices[0].delta.role = 'assistant'
        isRoleSent = true
      }
      chunk.choices[0].delta.content = part.value

      // output token countadd
      outputTokens += await vsCodeModel.countTokens(part.value)
    }
    // For tool call part
    else if (isToolCallPart(part)) {
      chunk.choices[0].delta.tool_calls = [
        {
          index: toolCallIndex++,
          id: part.callId,
          type: 'function',
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input),
          },
        },
      ]

      // Also add tool call to token count
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))

      isToolCalled = true
    }

    yield chunk
  }

  // end chunkgenerate
  yield {
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: isToolCalled ? 'tool_calls' : 'stop',
      },
    ],
    created,
    id: randomId,
    model: vsCodeModel.id,
    object: 'chat.completion.chunk',
    service_tier: undefined,
    system_fingerprint: undefined,
    usage: {
      completion_tokens: outputTokens,
      prompt_tokens: inputTokens,
      total_tokens: inputTokens + outputTokens,
      // completion_tokens_details: {
      // accepted_prediction_tokens: 0,
      // audio_tokens: 0,
      // reasoning_tokens: 0,
      // rejected_prediction_tokens: 0,
      // },
      // prompt_tokens_details: {
      // audio_tokens: 0,
      // cached_tokens: 0,
      // },
    },
  }
}

/**
 * Non-streaming: VSCode LanguageModelChatResponseOpenAI ChatCompletionformatConverts
 * @param vscodeResponse VSCode LanguageModelChatResponse
 * @param vsCodeModel VSCode LanguageModelChatinstance
 * @param inputTokens input token count
 * @returns Promise<ChatCompletion>
 */
async function convertVSCodeTextToOpenAICompletion(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
): Promise<ChatCompletion> {
  // Chat ID and timestampgenerate
  const id = `chatcmpl-${generateRandomId()}`
  const created = Math.floor(Date.now() / 1000)

  // Initialize content and toolCalls
  let textBuffer = ''
  const toolCalls: Chat.Completions.ChatCompletionMessageToolCall[] = []
  let isToolCalled = false

  let outputTokens = 0 // output token count

  // stream Get parts sequentially from stream
  for await (const part of vscodeResponse.stream) {
    if (isTextPart(part)) {
      // Concatenate text to buffer
      textBuffer += part.value

      // output token countadd
      outputTokens += await vsCodeModel.countTokens(part.value)
    } else if (isToolCallPart(part)) {
      // Add tool to toolCalls
      toolCalls.push({
        id: part.callId,
        type: 'function',
        function: {
          name: part.name,
          arguments: JSON.stringify(part.input),
        },
      })

      // Also add tool call to token count
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))

      isToolCalled = true
    }
  }

  // Generate choice object
  const choice: Chat.Completions.ChatCompletion.Choice = {
    index: 0,
    message: {
      role: 'assistant',
      content: textBuffer,
      refusal: null,
      tool_calls: isToolCalled ? toolCalls : undefined,
    },
    logprobs: null,
    finish_reason: isToolCalled ? 'tool_calls' : 'stop',
  }

  // ChatCompletionobjectreturn
  return {
    choices: [choice],
    created,
    id,
    model: vsCodeModel.id,
    object: 'chat.completion',
    service_tier: undefined,
    system_fingerprint: undefined,
    usage: {
      completion_tokens: outputTokens,
      prompt_tokens: inputTokens,
      total_tokens: inputTokens + outputTokens,
      // completion_tokens_details: {
      // accepted_prediction_tokens: 0,
      // audio_tokens: 0,
      // reasoning_tokens: 0,
      // rejected_prediction_tokens: 0,
      // },
      // prompt_tokens_details: {
      // audio_tokens: 0,
      // cached_tokens: 0,
      // },
    },
  }
}
