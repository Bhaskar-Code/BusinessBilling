/**
 * Cloudflare D1 Database Client
 * Interacts directly with Cloudflare D1 serverless SQLite database via Cloudflare REST API v4.
 */

export interface D1Config {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export function getD1Config(): D1Config | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (accountId && databaseId && apiToken) {
    return { accountId, databaseId, apiToken };
  }
  return null;
}

export function isD1Configured(): boolean {
  return getD1Config() !== null;
}

export async function queryD1(sql: string, params: any[] = []): Promise<any[]> {
  const config = getD1Config();
  if (!config) {
    throw new Error('Cloudflare D1 credentials are not configured in environment.');
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      params,
    }),
  });

  const json = await response.json() as any;

  if (!json.success) {
    const errorMsg = json.errors?.map((e: any) => e.message).join(', ') || 'Failed to query Cloudflare D1';
    throw new Error(`Cloudflare D1 Error: ${errorMsg}`);
  }

  // Cloudflare D1 returns array of result objects
  const firstResult = json.result?.[0];
  return firstResult?.results || [];
}
