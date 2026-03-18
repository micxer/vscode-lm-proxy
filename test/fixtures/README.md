# Test Fixtures

This directory contains reusable test data for the VSCode LM Proxy test suite.

## Directory Structure

```
fixtures/
├── requests/     # Sample API requests (OpenAI, Anthropic, Claude Code formats)
└── responses/    # Sample API responses from VSCode Language Model API
```

## Purpose

Test fixtures provide consistent, realistic test data that can be shared across multiple tests. This improves test maintainability and ensures consistent testing scenarios.

## Usage

### Creating Fixtures

```typescript
// In requests/openai-simple.json
{
  "model": "gpt-4",
  "messages": [
    { "role": "user", "content": "Hello, world!" }
  ],
  "temperature": 0.7,
  "max_tokens": 100
}
```

### Using Fixtures in Tests

```typescript
import { describe, it, expect } from 'vitest';
import simpleRequest from '../fixtures/requests/openai-simple.json';

describe('OpenAI Converter', () => {
  it('should convert simple request', async () => {
    const result = await convertOpenAIRequest(simpleRequest);
    expect(result).toBeDefined();
  });
});
```

## Guidelines

1. **Keep fixtures simple**: Each fixture should test one specific scenario
2. **Use realistic data**: Fixtures should represent actual API usage patterns
3. **Document purpose**: Add comments explaining what each fixture tests
4. **Avoid sensitive data**: Never include real API keys or personal information

## Common Fixtures to Create

### OpenAI Requests
- Simple text message
- Multi-turn conversation
- Request with tools/functions
- Request with all parameters (temperature, top_p, etc.)
- Streaming request

### Anthropic Requests
- Simple message
- Message with system prompt
- Message with tools
- Message with thinking mode
- Request with content blocks (text, image, document)

### Expected Responses
- Successful text response
- Tool call response
- Streaming chunk sequence
- Error response formats
