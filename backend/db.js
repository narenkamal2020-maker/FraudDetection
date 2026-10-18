import neo4j from "neo4j-driver";
import dotenv from "dotenv";
dotenv.config();

const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
const username = process.env.NEO4J_USERNAME || "neo4j";
const password = process.env.NEO4J_PASSWORD || "fraudgraph123";

export const driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
  maxConnectionPoolSize: 20,
  connectionAcquisitionTimeout: 10000
});

export async function runQuery(cypher, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map(record => {
      const out = {};
      for (const key of record.keys) {
        const value = record.get(key);
        out[key] = value && typeof value.toNumber === "function" ? value.toNumber() : value;
      }
      return out;
    });
  } finally {
    await session.close();
  }
}
