import { Upload } from "./Upload";

export interface UploadsRepository {
  findByUuids(uploadsUuids: Upload['uuid'][]): Promise<Upload[]>;
  deleteManyByUuids(uuids: Upload['uuid'][]): Promise<void>;
}
