# Snyk MCP Server

[![smithery badge](https://smithery.ai/badge/@sammcj/mcp-snyk)](https://smithery.ai/server/@sammcj/mcp-snyk)

A standalone Model Context Protocol server for Snyk security scanning functionality.

**WARNING: THIS MCP SERVER IS CURRENTLY IN ALPHA AND IS NOT YET FINISHED!**

## Configuration

Update your Claude desktop config (`claude-config.json`):

```json
{
  "mcpServers": {
    "snyk": {
      "command": "npx",
      "args": [
        "-y",
        "github:sammcj/mcp-snyk"
      ],
      "env": {
        "SNYK_API_KEY": "your_snyk_token",
        "SNYK_ORG_ID": "your_default_org_id"  // Optional: Configure a default organisation ID
      }
    }
  }
}
```

Replace the token with your actual Snyk API token. The organisation ID can be configured in multiple ways:

1. In the MCP settings via `SNYK_ORG_ID` (as shown above)
2. Using the Snyk CLI: `snyk config set org=your-org-id`
3. Providing it directly in commands

The server will try these methods in order until it finds a valid organisation ID.

### Verifying Configuration

You can verify your Snyk token is configured correctly by asking Claude to run the verify_token command:

```
Verify my Snyk token configuration
```

This will check if your token is valid and show your Snyk user information. If you have the Snyk CLI installed and configured, it will also show your CLI-configured organization ID.

## Features

- Repository security scanning using GitHub/GitLab URLs
- Snyk project scanning
- Integration with Claude desktop
- Token verification
- Multiple organization ID configuration options
- Snyk CLI integration for organization ID lookup

## Usage

To scan a repository, you must provide its GitHub or GitLab URL:

```
Scan repository https://github.com/owner/repo for security vulnerabilities
```

IMPORTANT: The scan_repository command requires the actual repository URL (e.g., https://github.com/owner/repo). Do not use local file paths - always use the repository's URL on GitHub or GitLab.

For Snyk projects:

```
Scan Snyk project project-id-here
```

### Organization ID Configuration

The server will look for the organization ID in this order:

1. Command argument (if provided)
2. MCP settings environment variable (`SNYK_ORG_ID`)
3. Snyk CLI configuration (`snyk config get org`)

You only need to specify the organization ID in your command if you want to override the configured values:

```
Scan repository https://github.com/owner/repo in organisation org-id-here
```

### Snyk CLI Integration

If you have the Snyk CLI installed (`npm install -g snyk`), the server can use it to:

- Get your default organisation ID
- Fall back to CLI configuration when MCP settings are not provided
- Show CLI configuration details in token verification output
This integration makes it easier to use the same organisation ID across both CLI and MCP server usage.
