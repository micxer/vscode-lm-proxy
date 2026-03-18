import { beforeEach, describe, expect, it } from 'vitest'
// Import after mocks are set up
import { modelManager } from '../../../src/model/manager'
import { LanguageModelChat, lm, Memento } from '../../mocks/vscode'

describe('ModelManager - Core Bug Fix Validation', () => {
  let mockContext: any
  let mockGlobalState: Memento

  beforeEach(async () => {
    // Create fresh global state
    mockGlobalState = new Memento()

    // Create mock context
    mockContext = {
      globalState: mockGlobalState,
      subscriptions: [],
      extensionPath: '/test/path',
      extensionUri: { fsPath: '/test/path' },
      asAbsolutePath: (path: string) => `/test/path/${path}`,
    }

    // Clear any existing models
    lm._resetMockModels()

    // Initialize and clear model manager state
    await modelManager.setExtensionContext(mockContext)
    modelManager.setOpenAIModelId(null)
    modelManager.setAnthropicModelId(null)
    modelManager.setClaudeCodeBackgroundModelId(null)
    modelManager.setClaudeCodeThinkingModelId(null)
  })

  it('should clear stale model IDs (the critical bug we fixed)', async () => {
    // Setup: Store a stale model ID that doesn't exist
    await mockGlobalState.update('openaiModelId', 'non-existent-model')

    // No models exist in the system
    lm._setMockModels([])

    // Execute: Initialize with stale ID
    await modelManager.setExtensionContext(mockContext)

    // Verify: Stale ID should be cleared
    const modelId = modelManager.getOpenAIModelId()
    expect(modelId).toBeNull()
  })

  it('should restore valid model IDs at startup', async () => {
    // Setup: Create a valid model and store its ID
    const validModel = new LanguageModelChat(
      'valid-model-id',
      'copilot',
      'gpt-4',
      '1.0',
      'GPT-4',
      8192,
    )
    lm._setMockModels([validModel])
    await mockGlobalState.update('openaiModelId', 'valid-model-id')

    // Execute: Initialize with valid ID
    await modelManager.setExtensionContext(mockContext)

    // Verify: Valid ID should be restored
    const modelId = modelManager.getOpenAIModelId()
    expect(modelId).toBe('valid-model-id')
  })

  it('should allow setting model ID to null', () => {
    // Setup: Set a model first
    modelManager.setOpenAIModelId('test-model')
    expect(modelManager.getOpenAIModelId()).toBe('test-model')

    // Execute: Clear it
    modelManager.setOpenAIModelId(null)

    // Verify: Should be null
    expect(modelManager.getOpenAIModelId()).toBeNull()
  })

  it('should clear globalState when setting to null', async () => {
    // Setup context first
    await modelManager.setExtensionContext(mockContext)

    // Set a model
    modelManager.setOpenAIModelId('test-model')
    expect(mockGlobalState.get('openaiModelId')).toBe('test-model')

    // Execute: Clear it
    modelManager.setOpenAIModelId(null)

    // Verify: globalState should also be cleared
    expect(mockGlobalState.get('openaiModelId')).toBeUndefined()
  })

  it('should handle mixed valid and invalid model IDs', async () => {
    // Setup: One valid model
    const validModel = new LanguageModelChat(
      'valid-id',
      'copilot',
      'gpt-4',
      '1.0',
      'GPT-4',
    )
    lm._setMockModels([validModel])

    // Store one valid and one invalid ID
    await mockGlobalState.update('openaiModelId', 'valid-id')
    await mockGlobalState.update('anthropicModelId', 'invalid-id')

    // Execute
    await modelManager.setExtensionContext(mockContext)

    // Verify: Valid restored, invalid cleared
    expect(modelManager.getOpenAIModelId()).toBe('valid-id')
    expect(modelManager.getAnthropicModelId()).toBeNull()
  })
})
