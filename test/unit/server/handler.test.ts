import { beforeEach, describe, expect, it } from 'vitest'
import { modelManager } from '../../../src/model/manager'
import {
  getVSCodeModel,
  isTextPart,
  isToolCallPart,
} from '../../../src/server/handler'
import {
  LanguageModelChat,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
  lm,
  Memento,
} from '../../mocks/vscode'

describe('Handler', () => {
  let mockContext: any
  let mockGlobalState: Memento

  beforeEach(async () => {
    // Reset mock state
    lm._resetMockModels()

    // Create mock context
    mockGlobalState = new Memento()
    mockContext = {
      globalState: mockGlobalState,
      subscriptions: [],
      extensionPath: '/test/path',
      extensionUri: { fsPath: '/test/path' },
      asAbsolutePath: (path: string) => `/test/path/${path}`,
    }

    // Initialize model manager
    await modelManager.setExtensionContext(mockContext)
    modelManager.setOpenAIModelId(null)
    modelManager.setAnthropicModelId(null)
  })

  describe('getVSCodeModel', () => {
    it('should resolve vscode-lm-proxy to selected OpenAI model', async () => {
      const testModel = new LanguageModelChat(
        'test-openai-model',
        'copilot',
        'gpt-4',
        '1.0',
        'GPT-4',
      )
      lm._setMockModels([testModel])
      modelManager.setOpenAIModelId('test-openai-model')

      const result = await getVSCodeModel('vscode-lm-proxy', 'openai')

      expect(result.vsCodeModel.id).toBe('test-openai-model')
    })

    it('should resolve vscode-lm-proxy to selected Anthropic model', async () => {
      const testModel = new LanguageModelChat(
        'test-anthropic-model',
        'anthropic',
        'claude-3.5-sonnet',
        '1.0',
        'Claude',
      )
      lm._setMockModels([testModel])
      modelManager.setAnthropicModelId('test-anthropic-model')

      const result = await getVSCodeModel('vscode-lm-proxy', 'anthropic')

      expect(result.vsCodeModel.id).toBe('test-anthropic-model')
    })

    it('should throw error when vscode-lm-proxy used with no model selected', async () => {
      // No model selected
      await expect(getVSCodeModel('vscode-lm-proxy', 'openai')).rejects.toThrow(
        'No valid openai model selected',
      )
    })

    it('should retrieve direct model ID', async () => {
      const testModel = new LanguageModelChat(
        'direct-model-id',
        'copilot',
        'gpt-4',
        '1.0',
        'GPT-4',
      )
      lm._setMockModels([testModel])

      const result = await getVSCodeModel('direct-model-id', 'openai')

      expect(result.vsCodeModel.id).toBe('direct-model-id')
    })

    it('should handle empty array from selectChatModels (the bug scenario)', async () => {
      // No models exist
      lm._setMockModels([])
      modelManager.setOpenAIModelId('stale-model-id')

      // Should throw with helpful error message
      await expect(getVSCodeModel('vscode-lm-proxy', 'openai')).rejects.toThrow(
        'Stored openai model is no longer available',
      )

      // Should clear the stale ID
      expect(modelManager.getOpenAIModelId()).toBeNull()
    })

    it('should provide helpful error for unavailable direct model ID', async () => {
      lm._setMockModels([])

      await expect(
        getVSCodeModel('non-existent-model', 'openai'),
      ).rejects.toThrow('Model "non-existent-model" not found')
    })

    it('should route haiku models to Claude Code background', async () => {
      const testModel = new LanguageModelChat(
        'haiku-model',
        'anthropic',
        'claude-3.5-haiku',
        '1.0',
        'Haiku',
      )
      lm._setMockModels([testModel])
      modelManager.setClaudeCodeBackgroundModelId('haiku-model')

      const result = await getVSCodeModel('claude-haiku-model', 'claude')

      expect(result.vsCodeModel.id).toBe('haiku-model')
    })

    it('should route sonnet models to Claude Code thinking', async () => {
      const testModel = new LanguageModelChat(
        'sonnet-model',
        'anthropic',
        'claude-3.5-sonnet',
        '1.0',
        'Sonnet',
      )
      lm._setMockModels([testModel])
      modelManager.setClaudeCodeThinkingModelId('sonnet-model')

      const result = await getVSCodeModel('claude-sonnet-model', 'claude')

      expect(result.vsCodeModel.id).toBe('sonnet-model')
    })
  })

  describe('isTextPart', () => {
    it('should identify LanguageModelTextPart correctly', () => {
      const textPart = new LanguageModelTextPart('test text')
      expect(isTextPart(textPart)).toBe(true)
    })

    it('should return false for non-text parts', () => {
      const toolPart = new LanguageModelToolCallPart('test', 'id', {})
      expect(isTextPart(toolPart)).toBe(false)
    })

    it('should return false for plain objects', () => {
      const plain = { value: 'test' }
      expect(isTextPart(plain)).toBe(false)
    })
  })

  describe('isToolCallPart', () => {
    it('should identify LanguageModelToolCallPart correctly', () => {
      const toolPart = new LanguageModelToolCallPart('test', 'id', {})
      expect(isToolCallPart(toolPart)).toBe(true)
    })

    it('should return false for non-tool-call parts', () => {
      const textPart = new LanguageModelTextPart('test')
      expect(isToolCallPart(textPart)).toBe(false)
    })

    it('should return false for plain objects', () => {
      const plain = { name: 'test' }
      expect(isToolCallPart(plain)).toBe(false)
    })
  })
})
