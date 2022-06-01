import { Contact } from './Contact';
import { ContactsRepository } from './Repository';

const formatFromMongoToContact = (mongoContact: any): Contact => {
  // WARNING: because of storj-models _id is a string. and doing toObject returns an object with _id deleted:
  const id = mongoContact._id;
  const contact = mongoContact.toObject();
  delete contact._id;
  return { id, nodeID: id, ...contact };
};
export class MongoDBContactsRepository implements ContactsRepository {
  constructor(private model: any) {}

  async findById(id: Contact['id']): Promise<Contact | null> {
    let contact = await this.model.findOne({ _id: id });

    if (!contact) {
      return null;
    }

    return formatFromMongoToContact(contact);
  }

  async findByIds(ids: string[]): Promise<Contact[]> {
    const rawContacts = await this.model.find({ _id: { $in: ids } });

    return rawContacts.map(formatFromMongoToContact);
  }
}
