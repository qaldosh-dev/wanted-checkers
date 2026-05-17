import test from "node:test";
import assert from "node:assert/strict";
import { findPlayerStatsByUserIds } from "../src/playerStatsRepository.js";

test("player stat bulk lookup treats user ids as integers", async () => {
  let sql = "";
  let params = null;
  const client = {
    async query(queryText, queryParams) {
      sql = queryText;
      params = queryParams;
      return { rows: [] };
    }
  };

  await findPlayerStatsByUserIds([1, 2], { client });

  assert.match(sql, /ANY\(\$1::int\[\]\)/);
  assert.deepEqual(params, [[1, 2]]);
});
