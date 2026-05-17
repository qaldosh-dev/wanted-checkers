import test from "node:test";
import assert from "node:assert/strict";
import {
  createFriendshipRequest,
  findFriendshipBetween,
  resetFriendshipRequest,
  updateFriendshipStatus
} from "../src/friends/friendshipRepository.js";

test("friendship pair lookup uses normalized integer user ids", async () => {
  let sql = "";
  let params = null;
  const client = {
    async query(queryText, queryParams) {
      sql = queryText;
      params = queryParams;
      return { rowCount: 0, rows: [] };
    }
  };

  await findFriendshipBetween(7, 3, { client });

  assert.match(sql, /LEAST\(\$1::int, \$2::int\)/);
  assert.match(sql, /GREATEST\(\$1::int, \$2::int\)/);
  assert.deepEqual(params, [7, 3]);
});

test("declined friendships can be re-requested with fresh requester and addressee ids", async () => {
  let sql = "";
  let params = null;
  const client = {
    async query(queryText, queryParams) {
      sql = queryText;
      params = queryParams;
      return {
        rowCount: 1,
        rows: [
          {
            id: 4,
            requester_user_id: 9,
            addressee_user_id: 2,
            status: "pending",
            created_at: new Date("2026-01-01T00:00:00Z"),
            updated_at: new Date("2026-01-02T00:00:00Z")
          }
        ]
      };
    }
  };

  const friendship = await resetFriendshipRequest(4, 9, 2, { client });

  assert.match(sql, /requester_user_id = \$2/);
  assert.match(sql, /addressee_user_id = \$3/);
  assert.deepEqual(params, [4, 9, 2]);
  assert.equal(friendship.requesterUserId, 9);
  assert.equal(friendship.addresseeUserId, 2);
  assert.equal(friendship.status, "pending");
});

test("friendship writes return unaliased columns", async () => {
  const queries = [];
  const client = {
    async query(queryText) {
      queries.push(queryText);
      return {
        rowCount: 1,
        rows: [
          {
            id: 8,
            requester_user_id: 1,
            addressee_user_id: 2,
            status: "pending",
            created_at: new Date("2026-01-01T00:00:00Z"),
            updated_at: new Date("2026-01-02T00:00:00Z")
          }
        ]
      };
    }
  };

  await createFriendshipRequest(1, 2, { client });
  await updateFriendshipStatus(8, "accepted", { client });
  await resetFriendshipRequest(8, 2, 1, { client });

  for (const sql of queries) {
    assert.doesNotMatch(sql, /RETURNING\s+f\./);
    assert.match(sql, /RETURNING\s+id,/);
  }
});
