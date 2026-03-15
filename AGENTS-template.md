# Instructions for AI Assistants: Using the Knowledge Base MCP Server

When working in this workspace, use the **open-webui-knowledge** MCP server to search knowledge bases whenever relevant. Prefer knowledge base results over generic answers for internal standards, architecture, and project-specific context.

## When to Query Knowledge Bases

Use the MCP tools **list_knowledge_bases**, **search_knowledge_base**, and **get_knowledge_base_info** when:

1. **The user refers to documentation or knowledge**
   e.g. “check the docs”, “per our guidelines”, “in our documentation”, “knowledge base”.

2. **The question is about internal standards, architecture, or recommended solutions**
   Map topics to the appropriate knowledge base(s) using the table below (customize for your bases).

3. **The question is about project- or company-specific processes**
   Use the relevant knowledge base for sales, marketing, task templates, or other domains you have configured.

## Knowledge Base IDs (for search_knowledge_base)

Call **list_knowledge_bases** to get the current list, then fill in this table so the AI can choose the right base:

| Knowledge base (name)   | ID                  |
| ----------------------- | ------------------- |
| _Example: Backend Docs_ | _`your-kb-id-here`_ |
| _Add more rows…_        | _`…`_               |

**Keeping the table up to date:** If **list_knowledge_bases** shows new bases, different IDs, or missing entries, update this table so it matches the current list. That keeps the reference accurate for future sessions.

When in doubt, call **list_knowledge_bases** first to get the current list and descriptions.

## How to Search

- Use **search_knowledge_base** with `knowledge_base_id` and `query` (and optionally `k` for number of results).
- Build `query` from the user’s question (architecture, tech stack, “how we do X”, naming, etc.).
- Prefer the most specific base for the topic; search multiple bases when the question spans several domains.

Cite retrieved snippets and, when they conflict with generic best practices, prefer the knowledge base content for this project.
