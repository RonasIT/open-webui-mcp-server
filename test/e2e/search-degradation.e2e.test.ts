import { describe, it, expect } from 'vitest';
import { getKnowledgeBaseFileContent, searchKnowledgeBase } from '../../src/tool-handlers.js';
import { expectTextContent, getFirstKnowledgeBaseFile, hasE2eEnv, withE2eSession } from './helpers.js';

describe.skipIf(!hasE2eEnv)('e2e: Open WebUI retrieval config health', () => {
  it('fails when semantic search is broken but direct file read works', async () => {
    const { kbId, fileId, filename } = await getFirstKnowledgeBaseFile();

    await withE2eSession(async ({ client, ctx }) => {
      const fileText = expectTextContent(await getKnowledgeBaseFileContent(client, { file_id: fileId }, ctx));

      expect(fileText).toContain(`File ID: ${fileId}`);
      expect(fileText.length).toBeGreaterThan(fileId.length + 20);

      const searchOutcome = await searchKnowledgeBase(
        client,
        { knowledge_base_id: kbId, query: 'architecture', k: 3 },
        ctx,
      ).catch((error: Error) => error);

      if (searchOutcome instanceof Error) {
        expect.fail(
          [
            'Open WebUI retrieval config appears broken: semantic search failed but direct file read succeeded.',
            `Knowledge base: ${kbId}`,
            `File: ${fileId}${filename ? ` (${filename})` : ''}`,
            `Search error: ${searchOutcome.message}`,
            'Check Admin Settings → Documents / Embeddings in Open WebUI.',
          ].join('\n'),
        );
      }

      expect(expectTextContent(searchOutcome)).toMatch(/Found \d+ results for query|No results found for query/);
    });
  });
});
