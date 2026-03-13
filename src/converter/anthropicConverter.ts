import type {
  ContentBlock,
  Message,
  MessageCreateParams,
  RawMessageStreamEvent,
  StopReason,
  Tool,
  WebSearchTool20250305,
} from '@anthropic-ai/sdk/resources'
import * as vscode from 'vscode'
import { isTextPart, isToolCallPart } from '../server/handler'
import { generateRandomId } from '../utils'
import { logger } from '../utils/logger'

/**
 * Anthropic API MessageCreateParams request
 * to VSCode extension API chat request format.
 *
 * - Convert system prompts and messages to VSCode message array
 * - tools, tool_choiceetc.VSCode API optionsformat
 * - VSCode APInot supported parameters modelOptions consolidated
 * - specification differences to absorb conversion logic includes
 *
 * @param anthropicRequest Anthropic chat request parameters
 * @param vsCodeModel VSCode LanguageModelChatinstance
 * @returns VSCodeextensionAPIfor chat message array and options
 */
export async function convertAnthropicRequestToVSCodeRequest(
  anthropicRequest: MessageCreateParams,
  vsCodeModel: vscode.LanguageModelChat,
): Promise<{
  messages: vscode.LanguageModelChatMessage[]
  options: vscode.LanguageModelChatRequestOptions
  inputTokens: number
}> {
  logger.debug('Converting Anthropic request to VSCode request')

  // --- messagesconvert ---
  const messages: vscode.LanguageModelChatMessage[] = []

  // system promptif existsassistant role with add at beginning
  if ('system' in anthropicRequest && anthropicRequest.system) {
    if (typeof anthropicRequest.system === 'string') {
      // string case
      messages.push(
        new vscode.LanguageModelChatMessage(
          vscode.LanguageModelChatMessageRole.Assistant,
          `[SYSTEM] ${anthropicRequest.system}`,
          'System',
        ),
      )
    } else if (Array.isArray(anthropicRequest.system)) {
      // TextBlockParam[] case
      for (const block of anthropicRequest.system) {
        if (block.type === 'text' && typeof block.text === 'string') {
          messages.push(
            new vscode.LanguageModelChatMessage(
              vscode.LanguageModelChatMessageRole.Assistant,
              `[SYSTEM] ${block.text}`,
              'System',
            ),
          )
        }
      }
    }
  }

  // normal messagesadd
  messages.push(
    ...anthropicRequest.messages.map(msg => {
      let role: vscode.LanguageModelChatMessageRole
      let content:
        | string
        | Array<
            | vscode.LanguageModelTextPart
            | vscode.LanguageModelToolResultPart
            | vscode.LanguageModelToolCallPart
          > = ''
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
      }

      // contentconvert
      if (typeof msg.content === 'string') {
        content = msg.content
      } else if (Array.isArray(msg.content)) {
        content = msg.content.map(c => {
          switch (c.type) {
            case 'text':
              return new vscode.LanguageModelTextPart(c.text)
            case 'image':
              return new vscode.LanguageModelTextPart(
                `[Image] ${JSON.stringify(c)}`,
              )
            case 'tool_use':
              return new vscode.LanguageModelToolCallPart(
                c.id,
                c.name,
                c.input ?? {},
              )
            case 'tool_result':
              // c.contentarray case
              if (Array.isArray(c.content)) {
                return new vscode.LanguageModelToolResultPart(
                  c.tool_use_id,
                  c.content.map(c => {
                    switch (c.type) {
                      case 'text':
                        return new vscode.LanguageModelTextPart(c.text)
                      case 'image':
                        return new vscode.LanguageModelTextPart(
                          `[Image] ${JSON.stringify(c)}`,
                        )
                    }
                  }),
                )
              }

              // c.contentstring case
              return new vscode.LanguageModelToolResultPart(c.tool_use_id, [
                new vscode.LanguageModelTextPart(c.content ?? 'undefined'),
              ])
            case 'document':
              return new vscode.LanguageModelTextPart(
                `[Document] ${JSON.stringify(c)}`,
              )
            case 'thinking':
              return new vscode.LanguageModelTextPart(
                `[Thinking] ${JSON.stringify(c)}`,
              )
            case 'redacted_thinking':
              return new vscode.LanguageModelTextPart(
                `[Redacted Thinking] ${JSON.stringify(c)}`,
              )
            case 'server_tool_use':
              return new vscode.LanguageModelTextPart('[Server Tool Use]')
            case 'web_search_tool_result':
              return new vscode.LanguageModelTextPart(
                '[Web Search Tool Result]',
              )
            default:
              return new vscode.LanguageModelTextPart(
                `[Unknown Type] ${JSON.stringify(c)}`,
              )
          }
        })
      }

      return new vscode.LanguageModelChatMessage(role, content, name)
    }),
  )

  // --- Calculate input tokens ---
  let inputTokens = 0
  for (const msg of messages) {
    inputTokens += await vsCodeModel.countTokens(msg)
  }

  // --- Generate options ---
  const options: vscode.LanguageModelChatRequestOptions = {}

  // Convert tool_choice
  if (
    'tool_choice' in anthropicRequest &&
    anthropicRequest.tool_choice !== undefined
  ) {
    const tc = anthropicRequest.tool_choice
    switch (tc.type) {
      case 'auto':
        options.toolMode = vscode.LanguageModelChatToolMode.Auto
        break
      case 'any':
        options.toolMode = vscode.LanguageModelChatToolMode.Required
        break
      case 'tool':
        options.toolMode = vscode.LanguageModelChatToolMode.Required
        break
      case 'none': // VSCode API None does not exist, so Auto
        options.toolMode = vscode.LanguageModelChatToolMode.Auto
        break
    }
  }

  // Convert tools
  if ('tools' in anthropicRequest && Array.isArray(anthropicRequest.tools)) {
    options.tools = anthropicRequest.tools.map(tool => {
      switch (tool.name) {
        // bash
        case 'bash':
          return {
            name: tool.name,
            description: `Bash shell execution. Type: ${tool.type}`,
            inputSchema: undefined,
          }
        // code execution
        case 'code_execution':
          return {
            name: tool.name,
            description: `Code execution. Type: ${tool.type}`,
            inputSchema: undefined,
          }
        // computer use
        case 'computer': {
          const computerTool = tool as any
          return {
            name: computerTool.name,
            description: `Computer use tool. Type: ${tool.type}`,
            inputSchema: {
              display_height_px: computerTool.display_height_px,
              display_width_px: computerTool.display_width_px,
              display_number: computerTool.display_number,
            },
          }
        }
        // text editor (str_replace_editor)
        case 'str_replace_editor': {
          return {
            name: tool.name,
            description: `Text editor tool. Type: ${tool.type}`,
          }
        }
        // text editor (str_replace_based_edit_tool)
        case 'str_replace_based_edit_tool': {
          return {
            name: tool.name,
            description: `Text editor tool. Type: ${tool.type}`,
          }
        }
        // web search
        case 'web_search': {
          const webSearchTool = tool as WebSearchTool20250305
          return {
            name: tool.name,
            description: `Web search tool. Type: ${tool.type}`,
            inputSchema: {
              allowed_domains: webSearchTool.allowed_domains,
              blocked_domains: webSearchTool.blocked_domains,
              max_uses: webSearchTool.max_uses,
              user_location: webSearchTool.user_location,
            },
          }
        }
        // custom tool
        default: {
          const customTool = tool as Tool
          return {
            name: customTool.name,
            description:
              customTool.description ?? `Custom tool. Name: ${customTool.name}`,
            inputSchema: customTool.input_schema,
          }
        }
      }
    })
  }

  // --- Consolidate other parameters into modelOptions ---
  const modelOptions: { [name: string]: any } = {}
  const modelOptionKeys = [
    // 'max_tokens',
    'container',
    'mcp_servers',
    'metadata',
    'service_tier',
    'stop_sequences',
    'stream',
    'temperature',
    'thinking',
    'top_k',
    'top_p',
  ]

  // optionsmodelOptions
  for (const key of modelOptionKeys) {
    if (
      key in anthropicRequest &&
      (anthropicRequest as any)[key] !== undefined
    ) {
      modelOptions[key] = (anthropicRequest as any)[key]
    }
  }

  // max_tokensconvert
  // max_tokens1 case, use slightly larger numberConverts otherwise use
  modelOptions.max_tokens =
    anthropicRequest.max_tokens === 1 ? 16 : anthropicRequest.max_tokens

  // modelOptionsempty, add to options add
  if (Object.keys(modelOptions).length > 0) {
    options.modelOptions = modelOptions
  }

  // --- convertresultand log ---
  logger.debug('Converted Anthropic request to VSCode request', {
    messages,
    options,
    inputTokens,
  })

  return { messages, options, inputTokens }
}

/**
 * VSCode LanguageModelChatResponseAnthropic Message or AsyncIterable<RawMessageStreamEvent>formatConverts
 * For streaming RawMessageStreamEvent AsyncIterable, returns
 * For non-streaming full textMessageformat
 * @param vscodeResponse VSCode LanguageModelChatResponse
 * @param vsCodeModel VSCode LanguageModelChatinstance
 * @param isStreaming streamingwhether
 * @param inputTokens input token count
 * @returns Message or AsyncIterable<RawMessageStreamEvent>
 */
export function convertVSCodeResponseToAnthropicResponse(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  isStreaming: boolean,
  inputTokens: number,
): Promise<Message> | AsyncIterable<RawMessageStreamEvent> {
  if (isStreaming) {
    // streaming: VSCode stream to Anthropic RawMessageStreamEvent list
    return convertVSCodeStreamToAnthropicStream(
      vscodeResponse.stream,
      vsCodeModel,
      inputTokens,
    )
  }

  // Non-streaming: VSCode text to Anthropic Message
  return convertVSCodeTextToAnthropicMessage(
    vscodeResponse,
    vsCodeModel,
    inputTokens,
  )
}

/**
 * VSCode stream to Anthropic RawMessageStreamEvent list
 * - text part content_block_start, content_block_delta, content_block_stop with represented
 * - tool call part tool_use blockas represented
 * - finally message_delta, message_stopsend
 * @param stream VSCode stream
 * @param vsCodeModel VSCode LanguageModelChatinstance
 * @param inputTokens input token count
 * @returns Anthropic RawMessageStreamEvent AsyncIterable
 */
async function* convertVSCodeStreamToAnthropicStream(
  stream: AsyncIterable<
    vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart | unknown
  >,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
): AsyncIterable<RawMessageStreamEvent> {
  const messageId = `msg_${generateRandomId()}`
  let stopReason: StopReason = 'end_turn'
  let outputTokens = 0

  // --- message_starteventsend ---
  yield {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: vsCodeModel.id,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: inputTokens,
        output_tokens: 0,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        service_tier: null,
      },
    },
  }

  let contentIndex = 0
  let isInsideTextBlock = false

  // --- streamsequentiallyprocessing ---
  for await (const part of stream) {
    if (isTextPart(part)) {
      // text blockstart
      if (!isInsideTextBlock) {
        yield {
          type: 'content_block_start',
          index: contentIndex,
          content_block: { type: 'text', text: '', citations: [] },
        }
        isInsideTextBlock = true
      }
      // textdelta, send
      yield {
        type: 'content_block_delta',
        index: contentIndex,
        delta: { type: 'text_delta', text: part.value },
      }
      // output token countadd
      outputTokens += await vsCodeModel.countTokens(part.value)
    } else if (isToolCallPart(part)) {
      // text blockend
      if (isInsideTextBlock) {
        yield { type: 'content_block_stop', index: contentIndex }
        isInsideTextBlock = false
        contentIndex++
      }
      // tool callwhen stopReasonchange
      stopReason = 'tool_use'

      // tool call blockstart
      yield {
        type: 'content_block_start',
        index: contentIndex,
        content_block: {
          type: 'tool_use',
          id: part.callId,
          name: part.name,
          input: {},
        },
      }

      // input_json_delta, send
      yield {
        type: 'content_block_delta',
        index: contentIndex,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify(part.input ?? {}),
        },
      }

      // tool call blockend
      yield { type: 'content_block_stop', index: contentIndex }
      contentIndex++

      // Also add tool call to token count
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))
    }
  }

  // --- finally text blockif not endedclose ---
  if (isInsideTextBlock) {
    yield { type: 'content_block_stop', index: contentIndex }
    contentIndex++
  }

  // --- message_deltaeventsend ---
  yield {
    type: 'message_delta',
    delta: {
      stop_reason: stopReason,
      stop_sequence: null,
    },
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
    },
  }

  // --- message_stopeventsend ---
  yield { type: 'message_stop' }
}

/**
 * VSCode LanguageModelChatResponse
 * Anthropic MessageformatConverts
 * - text part text block as concatenation
 * - tool call part tool_use block as addition
 * @param vscodeResponse VSCode LanguageModelChatResponse
 * @param vsCodeModel VSCode LanguageModelChatinstance
 * @param inputTokens input token count
 * @returns Anthropic Message
 */
async function convertVSCodeTextToAnthropicMessage(
  vscodeResponse: vscode.LanguageModelChatResponse,
  vsCodeModel: vscode.LanguageModelChat,
  inputTokens: number,
): Promise<Message> {
  const id = `msg_${generateRandomId()}`

  const content: ContentBlock[] = []
  let textBuffer = ''
  let isToolCalled = false
  let outputTokens = 0

  // --- streamsequentiallyprocessing ---
  for await (const part of vscodeResponse.stream) {
    if (isTextPart(part)) {
      // Concatenate text to buffer
      textBuffer += part.value

      // output token countadd
      outputTokens += await vsCodeModel.countTokens(part.value)
    } else if (isToolCallPart(part)) {
      if (textBuffer) {
        // text bufferif exists, add as text block
        content.push({ type: 'text', text: textBuffer, citations: [] })
        textBuffer = ''
      }

      // Add tool_use block
      content.push({
        type: 'tool_use',
        id: part.callId,
        name: part.name,
        input: part.input,
      })

      // Also add tool call to token count
      outputTokens += await vsCodeModel.countTokens(JSON.stringify(part))

      // set flag
      isToolCalled = true
    }
  }

  // remaining text buffertext block as addition
  if (textBuffer) {
    content.push({ type: 'text', text: textBuffer, citations: [] })
  }

  // contentif empty, add emptytext block, add
  if (content.length === 0) {
    content.push({ type: 'text', text: '', citations: [] })
  }

  // --- Anthropic Messageobjectreturn ---
  return {
    id,
    type: 'message',
    role: 'assistant',
    content,
    model: vsCodeModel.id,
    stop_reason: isToolCalled ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
    // container: null
  }
}
