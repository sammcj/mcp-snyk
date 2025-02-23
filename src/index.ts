#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { execSync } from 'child_process';

const SNYK_API_KEY = process.env.SNYK_API_KEY;
const SNYK_ORG_ID = process.env.SNYK_ORG_ID; // Optional default org ID from settings

if (!SNYK_API_KEY) {
  console.error("SNYK_API_KEY environment variable is not set");
  process.exit(1);
}

// Helper function to check if Snyk CLI is installed
function isSnykCliInstalled(): boolean {
  try {
    execSync('snyk --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// Helper function to get org ID from Snyk CLI
function getOrgIdFromCli(): string | null {
  try {
    const output = execSync('snyk config get org', { encoding: 'utf8' }).trim();
    if (output && output !== 'undefined' && output !== 'null') {
      console.error('Retrieved organization ID from Snyk CLI configuration');
      return output;
    }
  } catch (error) {
    console.error('Failed to get organization ID from Snyk CLI:', error instanceof Error ? error.message : String(error));
  }
  return null;
}

// Schema definitions
const ScanRepoSchema = z.object({
  url: z.string().url().describe('GitHub/GitLab repository URL (e.g., https://github.com/owner/repo)'),
  branch: z.string().optional().describe('Branch to scan (optional)'),
  org: z.string().optional().describe('Snyk organisation ID (optional if configured in settings or available via Snyk CLI)')
});

const ScanProjectSchema = z.object({
  projectId: z.string().describe('Snyk project ID to scan'),
  org: z.string().optional().describe('Snyk organisation ID (optional if configured in settings or available via Snyk CLI)')
});

const ListProjectsSchema = z.object({
  org: z.string().optional().describe('Snyk organisation ID (optional if configured in settings or available via Snyk CLI)')
});

const VerifyTokenSchema = z.object({});

// Helper function to get org ID
function getOrgId(providedOrgId?: string): string {
  // First try the provided org ID
  if (providedOrgId) {
    return providedOrgId;
  }

  // Then try the environment variable
  if (SNYK_ORG_ID) {
    return SNYK_ORG_ID;
  }

  // Finally, try to get it from the Snyk CLI if installed
  if (isSnykCliInstalled()) {
    const cliOrgId = getOrgIdFromCli();
    if (cliOrgId) {
      return cliOrgId;
    }
  }

  throw new Error(
    'Snyk organisation ID is required. You can provide it in one of these ways:\n' +
    '1. Include it in the command\n' +
    '2. Configure SNYK_ORG_ID in the MCP settings\n' +
    '3. Set it in your Snyk CLI configuration using "snyk config set org=<org-id>"'
  );
}

// Helper function to execute Snyk CLI commands
function executeSnykCommand(command: string, args: string[] = []): string {
  try {
    const fullCommand = command
      ? `snyk ${command} ${args.join(' ')}`
      : `snyk ${args.join(' ')}`;

    console.error('Executing command:', fullCommand);

    // Execute the command and capture both stdout and stderr
    return execSync(fullCommand, { encoding: 'utf8' });
  } catch (error) {
    if (error instanceof Error && 'stdout' in error) {
      // If the command failed but returned output, return that output
      return (error as any).stdout || (error as any).stderr || error.message;
    }
    throw error;
  }
}

const server = new Server(
  { name: 'snyk-mcp-server', version: '1.0.0' },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "scan_repository",
        description: "Scan a GitHub/GitLab repository for security vulnerabilities using Snyk. Requires the repository's URL (e.g., https://github.com/owner/repo). Do not use local file paths.",
        inputSchema: zodToJsonSchema(ScanRepoSchema)
      },
      {
        name: "scan_project",
        description: "Scan an existing Snyk project",
        inputSchema: zodToJsonSchema(ScanProjectSchema)
      },
      {
        name: "list_projects",
        description: "List all projects in a Snyk organisation",
        inputSchema: zodToJsonSchema(ListProjectsSchema)
      },
      {
        name: "verify_token",
        description: "Verify that the configured Snyk token is valid",
        inputSchema: zodToJsonSchema(VerifyTokenSchema)
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "verify_token": {
        try {
          // Use whoami to verify the token
          const output = executeSnykCommand('whoami');
          return {
            content: [{
              type: "text",
              text: `✅ Token verified successfully!\n${output}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `❌ Token verification failed: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }

      case "scan_repository": {
        const args = ScanRepoSchema.parse(request.params.arguments);
        const orgId = getOrgId(args.org);

        try {
          // Extract owner/repo from GitHub URL
          const repoPath = args.url.split('github.com/')[1];
          if (!repoPath) {
            throw new Error('Invalid GitHub URL format');
          }

          // Use snyk code test with GitHub repository path
          const cliArgs = [
            'code',
            'test',
            '--org=' + orgId,
            '--json',
            'github.com/' + repoPath
          ];

          if (args.branch) {
            cliArgs.push('--branch=' + args.branch);
          }

          const output = executeSnykCommand('', cliArgs);
          return {
            content: [{
              type: "text",
              text: output
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to scan repository: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }

      case "scan_project": {
        const args = ScanProjectSchema.parse(request.params.arguments);
        const orgId = getOrgId(args.org);

        try {
          // Use snyk test to scan the project
          const output = executeSnykCommand('test', [
            '--org=' + orgId,
            '--project-id=' + args.projectId,
            '--json'
          ]);
          return {
            content: [{
              type: "text",
              text: output
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to scan project: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }

      case "list_projects": {
        const args = ListProjectsSchema.parse(request.params.arguments);
        const orgId = getOrgId(args.org);

        try {
          // Use snyk projects to list all projects
          const output = executeSnykCommand('projects', [
            'list',
            '--org=' + orgId,
            '--json'
          ]);
          return {
            content: [{
              type: "text",
              text: output
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

console.error('Snyk MCP Server running on stdio');
