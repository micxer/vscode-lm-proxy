import type { ChatCompletionCreateParams } from 'openai/resources'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  convertOpenAIRequestToVSCodeRequest,
  convertVSCodeResponseToOpenAIResponse,
} from '../../../src/converter/openaiConverter'
import {
  LanguageModelChat,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
} from '../../mocks/vscode'

describe('OpenAI Converter', () => {
  let mockModel: LanguageModelChat

  beforeEach(() => {
    mockModel = new LanguageModelChat(
      'test-model',
      'test-vendor',
      'gpt-4',
      '1.0',
      'Test GPT-4',
      8192,
    )
  })

  describe('convertOpenAIRequestToVSCodeRequest', () => {
    it('should convert simple text message', async () => {
      const openaiRequest: ChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      }

      const result = await convertOpenAIRequestToVSCodeRequest(
        openaiRequest,
        mockModel,
      )

      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].content).toBe('Hello')
      expect(result.messages[1].content).toBe('Hi there!')
    })

    it('should convert system messages with prefix', async () => {
      const openaiRequest: ChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
        ],
      }

      const result = await convertOpenAIRequestToVSCodeRequest(
        openaiRequest,
        mockModel,
      )

      expect(result.messages[0].content).toBe(
        '[SYSTEM] You are a helpful assistant',
      )
    })

    it('should convert developer role with prefix', async () => {
      const openaiRequest: ChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'developer', content: 'System instruction' }],
      }

      const result = await convertOpenAIRequestToVSCodeRequest(
        openaiRequest,
        mockModel,
      )

      expect(result.messages[0].content).toBe('[DEVELOPER] System instruction')
    })

    it('should handle empty messages array', async () => {
      const openaiRequest: ChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [],
      }

      const result = await convertOpenAIRequestToVSCodeRequest(
        openaiRequest,
        mockModel,
      )

      expect(result.messages).toHaveLength(0)
    })

    it('should consolidate model options', async () => {
      const openaiRequest: ChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_tokens: 100,
        top_p: 0.9,
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
      }

      const result = await convertOpenAIRequestToVSCodeRequest(
        openaiRequest,
        mockModel,
      )

      expect(result.options.modelOptions).toBeDefined()
      expect(result.options.modelOptions?.temperature).toBe(0.7)
      expect(result.options.modelOptions?.max_tokens).toBe(100)
      expect(result.options.modelOptions?.top_p).toBe(0.9)
    })

    it('should count input tokens', async () => {
      const openaiRequest: ChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      }

      const result = await convertOpenAIRequestToVSCodeRequest(
        openaiRequest,
        mockModel,
      )

      expect(result.inputTokens).toBeGreaterThan(0)
    })
  })

  describe('convertVSCodeResponseToOpenAIResponse', () => {
    it('should convert text response for non-streaming', async () => {
      const mockResponse = {
        text: (async function* () {
          yield 'Hello from VSCode'
        })(),
        stream: (async function* () {
          yield new LanguageModelTextPart('Hello from VSCode')
        })(),
      }

      const result = await convertVSCodeResponseToOpenAIResponse(
        mockResponse,
        'test-model-id',
        false,
        10,
      )

      expect(result.choices[0].message.content).toBe('Hello from VSCode')
      expect(result.choices[0].finish_reason).toBe('stop')
      expect(result.usage).toBeDefined()
    })

    it('should handle streaming responses', async () => {
      const mockResponse = {
        text: (async function* () {
          yield 'Hello '
          yield 'world'
        })(),
        stream: (async function* () {
          yield new LanguageModelTextPart('Hello ')
          yield new LanguageModelTextPart('world')
        })(),
      }

      const chunks: any[] = []
      const result = convertVSCodeResponseToOpenAIResponse(
        mockResponse,
        'test-model-id',
        true,
        10,
      )

      for await (const chunk of result) {
        chunks.push(chunk)
      }

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks[0].choices[0].delta).toBeDefined()
    })

    it('should handle tool calls in response', async () => {
      const mockResponse = {
        text: (async function* () {
          yield ''
        })(),
        stream: (async function* () {
          yield new LanguageModelToolCallPart('test_tool', 'call_123', {
            arg: 'value',
          })
        })(),
      }

      const result = await convertVSCodeResponseToOpenAIResponse(
        mockResponse,
        'test-model-id',
        false,
        10,
      )

      expect(result.choices[0].message.tool_calls).toBeDefined()
      expect(result.choices[0].message.tool_calls?.[0].function.name).toBe(
        'test_tool',
      )
    })
  })
})
