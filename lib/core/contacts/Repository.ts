import { Contact } from "./Contact";

export interface ContactsRepository {
  findById(id: Contact['id']): Promise<Contact | null>;
}
