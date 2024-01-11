import { PrepareFunctionReturnType } from '../init';
import { buildCommand } from './build'

import { default as destroyUserBuckets } from "./destroy-user-buckets.command";
import { default as emptyBucket } from "./empty-bucket.command";
import { default as emptyBuckets } from "./empty-buckets.command";
import { default as cleanStalledFrames } from "./clean-stalled-frames.command";

export default (resources: PrepareFunctionReturnType, onFinish: () => void) => ({
  [destroyUserBuckets.id]: buildCommand({
    version: destroyUserBuckets.version,
    command: `${destroyUserBuckets.id} <user_id>`,
    description: 'Destroys user\'s buckets',
    options: [],
  }).action(async (userId) => {
    await destroyUserBuckets.fn(resources, userId)
    onFinish();
  }),

  [emptyBucket.id]: buildCommand({
    version: emptyBucket.version,
    command: `${emptyBucket.id} <bucket_id>`,
    description: 'Empties a bucket',
    options: [],
  }).action(async (bucketId) => {
    await emptyBucket.fn(resources, bucketId)
    onFinish();
  }),

  [emptyBuckets.id]: buildCommand({
    version: emptyBuckets.version,
    command: `${emptyBuckets.id} <user_id>`,
    description: 'Empties user\'s buckets',
    options: [],
  }).action(async (userId) => {
    await emptyBuckets.fn(resources, userId);
    onFinish();
  }),

  [cleanStalledFrames.id]: buildCommand({
    version: cleanStalledFrames.version,
    command: `${cleanStalledFrames.id}`,
    description: 'Cleans stalled frames',
    options: [],
  }).action(async () => {
    await cleanStalledFrames.fn(resources);
    onFinish();
  }),
});
