import { CatalogClient } from '../catalog-builder/client.lambda-shared';

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '100', 10);

export async function handler() {
  const catalogClient = await CatalogClient.newClient();
  const catalog = catalogClient.packages;

  if (catalog.length === 0) {
    throw new Error('No packages found.');
  }

  // Remove duplicates from different major versions
  const packageNames = [...new Set(catalog.map((pkg) => pkg.name)).values()];

  // Split into chunks
  const chunks = [];
  for (let i = 0; i < packageNames.length; i += CHUNK_SIZE) {
    chunks.push({
      packages: packageNames.slice(i, i + CHUNK_SIZE),
      chunkIndex: Math.floor(i / CHUNK_SIZE),
    });
  }

  console.log(
    `Split ${packageNames.length} packages into ${chunks.length} chunks`
  );

  return { chunks };
}
