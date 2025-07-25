import { FileState } from "./FileState";

export interface FileStateRepository {
  setLastAccessDate(bucketEntryId: FileState['bucketEntry'], accessDate?: Date): Promise<FileState | null>
  deleteByBucketEntryIds(ids: FileState['bucketEntry'][]): Promise<void>
}
