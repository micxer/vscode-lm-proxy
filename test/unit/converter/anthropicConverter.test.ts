import { beforeEach, describe, expect, it } from 'vitest'
import {
  convertAnthropicRequestToVSCodeRequest,
  convertVSCodeResponseToAnthropicResponse,
} from '../../../src/converter/anthropicConverter'
import {
  LanguageModelChat,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
} from '../../mocks/vscode'

describe('Anthropic Converter', () => {
  let mockModel: LanguageModelChat

  beforeEach(() => {
    mockModel = new LanguageModelChat(
      'test-model',
      'anthropic',
      'claude-3.5-sonnet',
      '1.0',
      'Claude 3.5 Sonnet',
      200000,
    )
  })

  describe('convertAnthropicRequestToVSCodeRequest', () => {
    it('should convert simple text message', async () => {
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: 'Hello',
          },
        ],
        max_tokens: 1024,
      }

      const result = await convertAnthropicRequestToVSCodeRequest(
        anthropicRequest,
        mockModel,
      )

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].content).toBe('Hello')
    })

    it('should handle system prompt as string', async () => {
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        system: 'You are a helpful assistant',
        messages: [
          {
            role: 'user' as const,
            content: 'Hello',
          },
        ],
        max_tokens: 1024,
      }

      const result = await convertAnthropicRequestToVSCodeRequest(
        anthropicRequest,
        mockModel,
      )

      // System prompt should be prepended to first user message
      expect(result.messages[0].content).toContain(
        'You are a helpful assistant',
      )
    })

    it('should handle max_tokens=1 special case', async () => {
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: 'Hello',
          },
        ],
        max_tokens: 1,
      }

      const result = await convertAnthropicRequestToVSCodeRequest(
        anthropicRequest,
        mockModel,
      )

      // max_tokens: 1 should be converted to 16 per special handling
      expect(result.options.modelOptions?.max_tokens).toBe(16)
    })

    it('should handle temperature and top_p', async () => {
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: 'Hello',
          },
        ],
        max_tokens: 1024,
        temperature: 0.7,
        top_p: 0.9,
      }

      const result = await convertAnthropicRequestToVSCodeRequest(
        anthropicRequest,
        mockModel,
      )

      expect(result.options.modelOptions?.temperature).toBe(0.7)
      expect(result.options.modelOptions?.top_p).toBe(0.9)
    })

    it('should handle content blocks array', async () => {
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: 'Hello',
              },
              {
                type: 'text' as const,
                text: 'World',
              },
            ],
          },
        ],
        max_tokens: 1024,
      }

      const result = await convertAnthropicRequestToVSCodeRequest(
        anthropicRequest,
        mockModel,
      )

      expect(result.messages[0].content).toContain('Hello')
      expect(result.messages[0].content).toContain('World')
    })

    it('should count input tokens', async () => {
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: 'Hello world, this is a test message',
          },
        ],
        max_tokens: 1024,
      }

      const result = await convertAnthropicRequestToVSCodeRequest(
        anthropicRequest,
        mockModel,
      )

      expect(result.inputTokens).toBeGreaterThan(0)
    })
  })

  describe('convertVSCodeResponseToAnthropicResponse', () => {
    it('should convert text response for non-streaming', async () => {
      const mockResponse = {
        text: (async function* () {
          yield 'Hello from Claude'
        })(),
        stream: (async function* () {
          yield new LanguageModelTextPart('Hello from Claude')
        })(),
      }

      const result = await convertVSCodeResponseToAnthropicResponse(
        mockResponse,
        'test-model-id',
        false,
        10,
      )

      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: 'Hello from Claude',
      })
      expect(result.stop_reason).toBe('end_turn')
      expect(result.usage).toBeDefined()
    })

    it('should handle streaming responses', async () => {
      const mockResponse = {
        text: (async function* () {
          yield 'Hello '
          yield 'Claude'
        })(),
        stream: (async function* () {
          yield new LanguageModelTextPart('Hello ')
          yield new LanguageModelTextPart('Claude')
        })(),
      }

      const events: any[] = []
      const result = convertVSCodeResponseToAnthropicResponse(
        mockResponse,
        'test-model-id',
        true,
        10,
      )

      for await (const event of result) {
        events.push(event)
      }

      expect(events.length).toBeGreaterThan(0)
      expect(events[0].type).toBe('message_start')
    })

    it('should handle tool use in response', async () => {
      const mockResponse = {
        text: (async function* () {
          yield ''
        })(),
        stream: (async function* () {
          yield new LanguageModelToolCallPart('test_tool', 'call_123', {
            query: 'test',
          })
        })(),
      }

      const result = await convertVSCodeResponseToAnthropicResponse(
        mockResponse,
        'test-model-id',
        false,
        10,
      )

      expect(result.content).toBeDefined()
      expect(result.content.some((c: any) => c.type === 'tool_use')).toBe(true)
    })

    it('should handle empty response', async () => {
      const mockResponse = {
        text: (async function* () {
          yield ''
        })(),
        stream: (async function* () {
          yield new LanguageModelTextPart('')
        })(),
      }

      const result = await convertVSCodeResponseToAnthropicResponse(
        mockResponse,
        'test-model-id',
        false,
        10,
      )

      expect(result.content).toBeDefined()
      expect(result.usage).toBeDefined()
    })
  })
})
