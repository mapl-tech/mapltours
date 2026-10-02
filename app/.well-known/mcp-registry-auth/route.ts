/**
 * Proof for the official MCP Registry that mapltours.com owns the
 * com.mapltours/* server names (HTTP authentication,
 * https://modelcontextprotocol.io/registry/authentication). Only the PUBLIC
 * half of an Ed25519 key; the private half never enters this repository.
 * Rotate both together.
 */
export const dynamic = 'force-static'

export function GET(): Response {
  return new Response('v=MCPv1; k=ed25519; p=4N9kCgpO24k5RbXHS3Pz+J7bJCHvjjEDZR4ArpNw4TE=\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
