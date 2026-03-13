# LM Proxy

An extension that enables external applications to access VSCode's GitHub Copilot capabilities through OpenAI and Anthropic compatible REST APIs, allowing you to leverage the power of GitHub Copilot outside of the VSCode environment. This extension utilizes the VSCode Language Model API (LM API) to communicate with the language models provided by GitHub Copilot.

---

## 🔒 Security Notice

**This extension now includes important security features to protect your API access:**

- **Localhost-only binding**: Server only accepts connections from your local machine
- **API key authentication**: Protect your server with a secure API key
- **CORS protection**: Prevents unauthorized browser-based access

**⚠️ IMPORTANT:** Please set an API key in your settings to secure your server. See the [Security Configuration](#security-configuration) section below.

For detailed security information, see [SECURITY.md](SECURITY.md).

---

## Features

- **External GitHub Copilot Access**: Use GitHub Copilot's powerful AI capabilities from any application, not just within VSCode.
- **OpenAI & Anthropic Compatible APIs**: Access GitHub Copilot through industry-standard API formats that are compatible with OpenAI's and Anthropic's interfaces.
- **CLI-based Coding Assistant Support**: Compatible with various [CLI-based coding assistants](https://clicodingagents.com/#directory) including [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview), [OpenAI Codex CLI](https://developers.openai.com/codex/cli/), and other tools that support OpenAI or Anthropic API formats.
- **Multiple Model Support**: Seamlessly switch between different language models available in VSCode, including GitHub Copilot's models.
- **Server Management**: Easily start and stop the proxy server through the VSCode command palette or status bar.
- **Streaming Support**: Full support for streaming responses for real-time applications.
- **Flexible Configuration**: Customize the server port and log levels to fit your needs.

---

## Installation

1. Open the **Extensions** view in VSCode.
2. Search for "LM Proxy".
3. Click **Install**.

Alternatively, you can download the `.vsix` file from the [releases page](https://github.com/ryonakae/vscode-lm-proxy/releases) and install it manually using the "Install from VSIX..." command.

---

## Usage

### Starting the Server

1. Open the Command Palette.
2. Run the `LM Proxy: Start LM Proxy Server` command.
3. The server status will be displayed in the status bar.

### Stopping the Server

1. Open the Command Palette.
2. Run the `LM Proxy: Stop LM Proxy Server` command.

### Selecting a Language Model

1. Open the Command Palette.
2. Run one of the following commands:
   - `LM Proxy: Select OpenAI API Model`
   - `LM Proxy: Select Anthropic API Model` 
   - `LM Proxy: Select Claude Code Background Model`
   - `LM Proxy: Select Claude Code Thinking Model`
3. Choose your desired model from the list.

### Use with CLI-based Coding Assistants

This extension is compatible with various [CLI-based coding assistants](https://clicodingagents.com/#directory) that support OpenAI or Anthropic API formats:

#### Claude Code
1. Set the `ANTHROPIC_BASE_URL` environment variable: `http://localhost:4000/anthropic/claude` (replace `4000` with your configured port if different)
2. If you've enabled API key authentication (recommended), set the `ANTHROPIC_API_KEY` environment variable to your configured API key
3. This allows you to use Claude Code via the endpoints provided by LM Proxy—in other words, you can access the LLMs offered by GitHub Copilot through Claude Code

#### OpenAI Codex CLI
1. Set the `OPENAI_API_KEY` environment variable to your LM Proxy API key (or a dummy value like `'xxx'` if authentication is disabled)
2. Add the following configuration to `~/.codex/config.toml`:

```toml
model = "vscode-lm-proxy"
model_provider = "vscode-lm-proxy"

[model_providers.vscode-lm-proxy]
name = "VSCode LM Proxy"
base_url = "http://localhost:4000/openai"
```

#### Other CLI-based Coding Assistants
Any other CLI-based coding assistants that are compatible with OpenAI API or Anthropic API and allow configuration of base URL and model names should be able to utilize LM Proxy as well. Simply configure the base URL to point to your LM Proxy server and set the appropriate model name.

#### How Model Selection Works
- If you specify the model name as `vscode-lm-proxy`, the model selected in the extension settings will be used.
- If you specify a model name directly (e.g. `gpt-4.1` or `claude-3.5-sonnet`), that model will be used for the request.

---

## Security Configuration

### Setting Up Authentication (Recommended)

1. Generate a secure API key:
   ```bash
   # On macOS/Linux:
   openssl rand -hex 32
   ```

2. Add it to your VSCode `settings.json`:
   ```json
   {
     "vscode-lm-proxy.apiKey": "your-generated-key-here"
   }
   ```

3. Include the API key in all requests using either:
   - `X-API-Key` header (recommended)
   - `Authorization: Bearer` header

**⚠️ WARNING:** Without an API key, anyone on your computer can access your server. Always set an API key for production use.

See [SECURITY.md](SECURITY.md) for complete security documentation.

---

## API Reference

The proxy server exposes the following endpoints:

**Note:** All examples below require authentication. Add `-H "X-API-Key: your-key-here"` to your requests if you've enabled API key authentication (recommended).

### OpenAI Compatible API

- **Chat Completions**: `POST /openai/v1/chat/completions` (supports streaming via the `stream` parameter)

```bash
# Without authentication (not recommended):
curl -X POST http://localhost:4000/openai/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "vscode-lm-proxy",
    "messages": [{"role":"user","content":"Hello!"}],
    "stream": true
  }'

# With API key authentication (recommended):
curl -X POST http://localhost:4000/openai/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: your-api-key-here' \
  -d '{
    "model": "vscode-lm-proxy",
    "messages": [{"role":"user","content":"Hello!"}],
    "stream": true
  }'
```
- **List Models**: `GET /openai/v1/models`

```bash
curl http://localhost:4000/openai/v1/models
```
- **Retrieve Model**: `GET /openai/v1/models/{model}`

```bash
curl http://localhost:4000/openai/v1/models/gpt-4.1
```

### Anthropic Compatible API

- **Messages**: `POST /anthropic/v1/messages` (supports streaming via the `stream` parameter)

```bash
curl -X POST http://localhost:4000/anthropic/v1/messages \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "vscode-lm-proxy",
    "messages": [{"role":"user","content":"Hello!"}],
    "stream": true
  }'
```
- **Count Tokens**: `POST /anthropic/v1/messages/count_tokens` (counts the number of tokens in a message)

```bash
curl -X POST http://localhost:4000/anthropic/v1/messages/count_tokens \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "vscode-lm-proxy",
    "messages": [{"role":"user","content":"Hello, Claude"}]
  }'
```
- **List Models**: `GET /anthropic/v1/models`
- **Retrieve Model**: `GET /anthropic/v1/models/{model}`

### Claude Code Compatible API

- **Messages**: `POST /anthropic/claude/v1/messages` (supports streaming via the `stream` parameter)

```bash
curl -X POST http://localhost:4000/anthropic/claude/v1/messages \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "vscode-lm-proxy",
    "messages": [{"role":"user","content":"Hello!"}],
    "stream": true
  }'
```
- **Count Tokens**: `POST /anthropic/claude/v1/messages/count_tokens`
- **List Models**: `GET /anthropic/claude/v1/models`
- **Retrieve Model**: `GET /anthropic/claude/v1/models/{model}`

For detailed information about the request and response formats, please refer to the official [OpenAI API documentation](https://platform.openai.com/docs/api-reference) and [Anthropic API documentation](https://docs.anthropic.com/en/api/overview).

---

## Configuration

You can configure the extension settings in the VSCode settings UI or by editing your `settings.json` file.

### Available Settings

- `vscode-lm-proxy.port`: The port number for the proxy server. (Default: `4000`)
- `vscode-lm-proxy.apiKey`: API key for authentication. **IMPORTANT:** Set this to secure your server. (Default: `""` - no authentication)
- `vscode-lm-proxy.enableCORS`: Enable CORS for browser-based access. Only enable if needed. (Default: `false`)
- `vscode-lm-proxy.logLevel`: The log level for the extension. (Default: `1` for INFO)
  - `0`: DEBUG - All logs including detailed information
  - `1`: INFO - Information, warnings, and errors
  - `2`: WARN - Warnings and errors only
  - `3`: ERROR - Errors only
- `vscode-lm-proxy.showOutputOnStartup`: Whether to show the output panel on startup. (Default: `false`)

### Example Configuration (Secure)

```json
{
  "vscode-lm-proxy.port": 4000,
  "vscode-lm-proxy.apiKey": "your-secure-random-key-here",
  "vscode-lm-proxy.enableCORS": false,
  "vscode-lm-proxy.logLevel": 1,
  "vscode-lm-proxy.showOutputOnStartup": false
}
```

---

## Commands

The following commands are available in the Command Palette:

- `LM Proxy: Start LM Proxy Server`: Starts the proxy server.
- `LM Proxy: Stop LM Proxy Server`: Stops the proxy server.
- `LM Proxy: Select OpenAI API Model`: Selects the OpenAI model to use.
- `LM Proxy: Select Anthropic API Model`: Selects the Anthropic model to use.
- `LM Proxy: Select Claude Code Background Model`: Selects the Claude Code background model to use.
- `LM Proxy: Select Claude Code Thinking Model`: Selects the Claude Code thinking model to use.
- `LM Proxy: Show Output Panel`: Shows the extension's output panel.
- `LM Proxy: Clear Output Panel`: Clears the extension's output panel.
- `LM Proxy: Set Log Level`: Sets the log level.

---

## How It Works

LM Proxy leverages the VSCode Language Model API (LM API) to communicate with GitHub Copilot's language models. The extension acts as a bridge between external applications and VSCode's built-in language model capabilities:

1. The extension starts a local proxy server that implements OpenAI and Anthropic compatible API endpoints
2. When a request is received, it translates the request into the appropriate format for the VSCode Language Model API
3. The response from GitHub Copilot (via the LM API) is then converted back into the expected OpenAI or Anthropic format
4. This enables seamless integration with existing applications and tools that are designed to work with these popular API formats

This approach allows you to utilize the full power of GitHub Copilot in your applications without having to implement custom integrations.

## License

This extension is licensed under the [MIT License](LICENSE).
