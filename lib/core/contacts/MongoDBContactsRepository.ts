import { Contact } from "./Contact";
import { ContactsRepository } from "./Repository";

export class MongoDBContactsRepository implements ContactsRepository {
  constructor(private model: any) {}
  
  async findById(id: Contact['id']): Promise<Contact | null> {
    let contact = await this.model.findOne({ _id: id });

    if (!contact) {
      return null;
    }

    contact = contact.toObject();

    return { id, ...contact } as Contact;
  }

  async findByIds(ids: string[]): Promise<Contact[]> {
    const rawContacts = await this.model.find({ _id: { $in: ids } });

    return rawContacts.map((rawContact: any) => rawContact.toObject());
  }
}
