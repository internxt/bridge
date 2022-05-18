import { Pool } from 'mysql';

export async function iterateOverUsers(
  pool: Pool,
  query: string,
  onEveryUser: Function
): Promise<void> {
  const chunkSize = 5;
  let page = 0;
  let moreResults = true;

  while (moreResults) {
    const users = await queryPromise<any[]>(pool, query, [
      chunkSize,
      page * chunkSize,
    ]);

    if (users.length === 0) {
      moreResults = false;
    }

    for (const user of users) {
      await onEveryUser(user);
    }

    page += 1;
  }
}

export async function getFileCountQuery(
  pool: Pool,
  query: string,
  fileId: string
): Promise<number> {
  const results = await queryPromise<any[]>(pool, query, [fileId]);

  if (results.length !== 1) {
    throw new Error("SQL for files didn't return a single row");
  }

  const { count } = results[0] as { count: unknown };

  if (typeof count === 'number') return count;
  else throw new Error("SQL for files didn't specify a count numeric column");
}

export async function processEntries(
  entries: any[],
  onEveryEntry: Function
): Promise<void> {
  for (const entry of entries) {
    await onEveryEntry(entry);
  }
}

export async function iterateOverCursor(cursor: any, onEveryEntry: Function) {
  // console.log('CURSOR', cursor);

  // https://mongoosejs.com/docs/api/querycursor.html#query_Query-Symbol.asyncIterator for Node >= 10.x (we use 14)
  for await (const doc of cursor) {
    await onEveryEntry(doc);
  }
}

export async function iterateOverCursorWithWindowOf(cursor: any, onEveryEntry: (entry: any) => Promise<void>, windowSize: number) {
  let window = [];

  for await (const doc of cursor) {
    window.push(doc);

    if (window.length >= windowSize) {
      const promises = window.map(onEveryEntry);
      await Promise.all(promises);
      window = [];
    }
  }

  if (window.length > 0) {
    const promises = window.map(onEveryEntry);
    await Promise.all(promises);
  }
}

function queryPromise<T>(pool: Pool, query: string, args: any[]): Promise<T> {
  return new Promise((resolve, reject) => {
    pool.query(query, args, (err, results: T) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

export function driveRepository(pool: Pool) {
  return {
    getUsers: (limit: number, offset: number, userId = 0): Promise<any[]> => {
      const query = `
        SELECT 
          users.id, 
          users.bridge_user as networkUser, 
          users.user_id as networkPass
        FROM
          users
        WHERE 
          users.id >= ${userId}
        ORDER BY
          users.id ASC
        LIMIT ${limit}
        OFFSET ${offset};
      `;

      return queryPromise(pool, query, []);
    },
    getFiles: (
      userId: number,
      limit: number,
      offset: number,
      fileId = 0
    ): Promise<any[]> => {
      const query = `
        SELECT 
          *
        FROM
          files
        WHERE 
            files.user_id = ${userId}
          AND
            files.id >= ${fileId}            
        ORDER BY
          files.id ASC
        LIMIT ${limit}
        OFFSET ${offset};
      `;

      return queryPromise(pool, query, []);
    },
    getFileByNetworkFileId: (networkFileId: string): Promise<any> => {
      const query = `
        SELECT 
          *
        FROM
          files 
        WHERE 
          files.file_id = ${networkFileId};
      `;

      return queryPromise(pool, query, []);
    },
    getUserBuckets: (userId: number): Promise<string[]> => {
      const query = `
        SELECT 
          folders.bucket
        FROM
          folders
        INNER JOIN
          users
        ON
          users.root_folder_id = folders.id
        WHERE
            users.id = ${userId} 
          AND
            bucket IS NOT NULL
      `;

      return queryPromise<{ bucket: string }[]>(pool, query, []).then((res) =>
        res.map((b) => b.bucket)
      );
    },
    getUsersOrTeamsWithEmail: (email: string): Promise<number> => {
      const query = `
        SELECT SUM(count) as count FROM (
          SELECT id, COUNT(*) AS count FROM users WHERE users.bridge_user = ?
          UNION
          SELECT id, COUNT(*) AS count FROM teams WHERE teams.bridge_user = ?
        ) users_and_teams ;`;

      return queryPromise<{ count: number }[]>(pool, query, [
        email,
        email,
      ]).then((res) => res[0].count);
    },
  };
}

export async function deleteBucketAndContents(
  { BucketEntryModel, FrameModel, PointerModel }: any,
  bucket: any,
  onPointerDelete: Function
) {
  const entries = await BucketEntryModel.find({ bucket: bucket._id }).populate(
    'frame'
  );

  for (const entry of entries) {
    await entry.remove();
    const frame = await FrameModel.findOne({ _id: entry.frame._id });
    const pointers = await PointerModel.find({ _id: { $in: frame.shards } });
    for (const pointer of pointers) {
      await pointer.remove();
      await onPointerDelete(pointer);
    }
    await frame.remove();
  }
  await bucket.remove();
}
