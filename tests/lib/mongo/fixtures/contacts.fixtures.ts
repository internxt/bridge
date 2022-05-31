import { Contact } from "../../../../lib/core/contacts/Contact";

type MongoContact = Omit<Contact, "id"> & {
  _id: string;
};

const userOneContacts: MongoContact[] = [
  {
    _id: "8a1c78a507689f6f54b847ad1cef1e614ee23f1e",
    address: "farmer",
    lastSeen: new Date("2022-05-30T13:32:27.055Z"),
    port: 43758,
    protocol: "1.2.0-INXT",
    reputation: 0,
    responseTime: 10000,
    spaceAvailable: true,
    ip: null,
  },
  {
    _id: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
    address: "farmer",
    lastSeen: new Date("2022-05-30T13:32:27.055Z"),
    port: 43758,
    protocol: "1.2.0-INXT",
    reputation: 0,
    responseTime: 10000,
    spaceAvailable: true,
    ip: null,
  },
];

export const contacts: MongoContact[] = userOneContacts;
