# VSCode LM Proxy Development Guide

This file provides development guidelines to Claude Code (claude.ai/code) and other AI assistants when working with the VSCode LM Proxy project code.

## Project Overview

VSCode LM Proxy is an extension that exposes VSCode's Language Model API as an OpenAI/Anthropic-compatible REST API.
This allows external applications to easily utilize VSCode's Language Model API.

## Technology Stack

- **TypeScript**: 5.8.3 (strict typing)
- **VSCode API**: 1.101.0 or later
- **Express**: 4.21.2 (REST API server)
- **Node.js**: 24.x
- **Biome**: 2.0.5 (linter and formatter)

## Development Commands

```bash
# Development
npm run compile          # Compile TypeScript
npm run watch           # Compile in watch mode

# Code Quality
npm run check           # Run Biome linter
biome check --write     # Auto-fix lint issues

# Packaging
npm run vscode:prepublish  # Build extension (before publishing)
```

## Project Structure

```
src/
├── extension.ts              # Extension entry point
├── commands/                 # VSCode command implementations
│   ├── index.ts             # Batch command registration
│   ├── model.ts             # Model selection commands
│   ├── output.ts            # Output panel commands
│   └── server.ts            # Server control commands
├── converter/               # API format conversion
│   ├── anthropicConverter.ts # Anthropic API conversion
│   └── openaiConverter.ts   # OpenAI API conversion
├── model/                   # Model management
│   └── manager.ts           # Model selection and management
├── server/                  # REST API server
│   ├── server.ts            # Express server configuration
│   ├── manager.ts           # Server start/stop
│   ├── handler.ts           # Common handlers
│   ├── openaiHandler.ts     # OpenAI API-compatible endpoint
│   ├── anthropicHandler.ts  # Anthropic API-compatible endpoint
│   └── claudeCodeHandler.ts # Claude Code-compatible endpoint
├── ui/                      # UI components
│   └── statusbar.ts         # Status bar management
└── utils/                   # Utilities
    ├── index.ts             # Utility functions
    └── logger.ts            # Logging functionality
```

## Main Features and Architecture

### 1. REST API Server
Express-based server that proxies VSCode Language Model API on localhost:

**API Endpoints:**
- OpenAI Chat Completions: `/openai/v1/chat/completions`
- Anthropic Messages: `/anthropic/v1/messages`
- Claude Code Messages: `/anthropic/claude/v1/messages`
- Model List: `/openai/v1/models`, `/anthropic/v1/models`
- Token Count: `/anthropic/v1/messages/count_tokens`

### 2. Model Management
Manages language models available in VSCode and maps them to OpenAI/Anthropic format model names:
- GitHub Copilot models
- Claude models (if available)
- Dynamic model selection and persistence

### 3. Request Conversion
Converts OpenAI/Anthropic format requests to VSCode Language Model API format:
- Message format conversion
- Parameter mapping
- Streaming response processing

### 4. UI Components
Manages server status and model selection in VSCode status bar:
- Server start/stop control
- Display currently selected model
- Easy model switching

## Coding Conventions

### TypeScript
- Use strict typing, avoid `any` type
- Provide explicit reason in comments when necessary
- Use async/await, avoid Promise chains

### Naming Conventions
- **Classes**: PascalCase (`ModelManager`, `ServerManager`)
- **Functions/Methods**: camelCase
- **Constants**: UPPER_SNAKE_CASE or readonly properties
- **File names**: camelCase (`extension.ts`, `manager.ts`)
- **Private members**: `_` prefix or private keyword

### Formatting Rules
- **Indentation**: 2 spaces
- **Quotes**: Single quotes (`'`)
- **Semicolons**: Required
- **Trailing commas**: Required for multi-line elements

### Error Handling
- Use try/catch appropriately
- Keep detailed error logs
- **Log Levels**: Use appropriate levels - DEBUG(0), INFO(1), WARN(2), ERROR(3)
- Return error responses in OpenAI/Anthropic-compatible format

## Configuration and Commands

### Extension Settings
- `vscode-lm-proxy.port`: Server port (default: 4000)
- `vscode-lm-proxy.apiKey`: API key for authentication (default: empty - no auth)
- `vscode-lm-proxy.enableCORS`: Enable CORS for browser access (default: false)
- `vscode-lm-proxy.logLevel`: Log level for extension (default: 1 for INFO)
- `vscode-lm-proxy.showOutputOnStartup`: Show output panel on startup (default: false)

### VSCode Commands
- `vscode-lm-proxy.startServer`: Start server
- `vscode-lm-proxy.stopServer`: Stop server
- `vscode-lm-proxy.selectOpenAIModel`: Select OpenAI model
- `vscode-lm-proxy.selectAnthropicModel`: Select Anthropic model
- `vscode-lm-proxy.selectClaudeCodeBackgroundModel`: Select Claude Code background model
- `vscode-lm-proxy.selectClaudeCodeThinkingModel`: Select Claude Code thinking model
- `vscode-lm-proxy.showOutput`: Show output panel
- `vscode-lm-proxy.clearOutput`: Clear output panel
- `vscode-lm-proxy.setLogLevel`: Set log level

## Performance and Security

### Performance Optimization
- Minimize memory usage
- Don't block UI thread with async processing
- Properly release resources when extension is disabled
- Limit JSON request size to 10MB

### Security Considerations
- **Localhost Binding**: Server listens only on 127.0.0.1 to prevent network access
- **API Key Authentication**: API key authentication required for all endpoints (except status) when configured
- **CORS Protection**: Blocks browser-based access by default
- **Data Protection**: Does not send user data externally
- **Sensitive Data Masking**: Masks API keys and other sensitive data in logs
- **Dependencies**: Regularly check for vulnerabilities in dependency packages
- **Security Documentation**: See SECURITY.md for details

## Development Notes

### Referencing Existing Code
- Reference existing code design and notation
- Manager class design utilizing singleton pattern
- Appropriate functional separation and module design

### Comment Rules
- JSDoc-style comments for public APIs
- Avoid comments explaining self-evident code
- Explain the "Why" of complex algorithms, business logic, and design tradeoffs

### Error Fixes
- For lint/typecheck, only fix Errors
- Do not fix Warnings or Info

## Extension Constraints

### Technical Requirements
- **VSCode Version**: Requires 1.101.0 or later
- **Workspace Restrictions**: Does not work in virtual workspaces or untrusted workspaces
- **Execution Environment**: Only works in local environment (not available in remote workspaces)
- **Extension Type**: Operates as UI extension

### API Restrictions
- Complies with usage restrictions of VSCode Language Model API
- Implements token limits and rate limits
- Provides appropriate error handling and restriction information

## Debugging and Troubleshooting

### Logging Functionality
- Supports problem diagnosis with detailed log output
- Dynamic log level changes via command
- Log viewing and clearing in output panel

### Error Handling
- Provides clear error codes and descriptions
- User-friendly error messages
- Records detailed stack traces for internal errors

# currentDate
Today's date is 2026-03-13.

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
