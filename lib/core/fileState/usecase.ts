import { FileStateRepository } from './Repository';

export class FileStateUsecase {

    constructor(
        private fileStateRepository: FileStateRepository,
    ) { }

    async updateOrSetLastAccessDate(bucketEntryId: string) {
        const fileState = await this.fileStateRepository.setLastAccessDate(bucketEntryId);
        return fileState
    }

    async removeFileStateByEntryId(bucketEntryId: string) {
        await this.fileStateRepository.deleteByBucketEntryIds([bucketEntryId]);
    }
}
