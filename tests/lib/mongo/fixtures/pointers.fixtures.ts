import { ObjectId } from "mongodb";
import { Pointer } from "../../../../lib/core/pointers/Pointer";

type MongoPointerModel = Required<Omit<Pointer, "id" | "frame">> & {
  _id: ObjectId;
  frame: ObjectId;
};

const pointersTest: MongoPointerModel[] = [
  {
    _id: new ObjectId("6294dc394329da00076670d5"),
    index: 0,
    hash: "fac3fef365682d026fa7450cd7fe8d9a42d26a16",
    size: 648778,
    challenges: [
      "3d4902d172e1a6252af6a41a19021dbbd46329afd2c1154276f3e531b7d8a990",
      "149e4d99637d1421410ef8cfc03ad434632866368b53080bfeaa77f010945df1",
      "66c2025af4e4dae4dc6f1c56f18967205ada8dbb73db7916a936a285e8498a89",
      "97f307cbfe696c9286b70139712dd7472dcb8982cf3b08f11b3ee0ccf4c821b4",
    ],
    tree: [
      "933cb36cb78fbf04e5a9cdde1feb9cc66f561cf6",
      "3df01a8543cbade1df00809e42efaa04b3cea5a9",
      "33cd67ae33287828cd1e74793fee14f85622fc88",
      "20dbbdf80ba83dfb5ae65d55b1206d7919808e26",
    ],
    parity: false,
    frame: new ObjectId("6294dc39d716b2000771e856"),
  },
  {
    _id: new ObjectId("6294dc3993fbb80008aa83e4"),
    index: 0,
    hash: "dac3fef365682d026fa7450cd7fe8d9a42d26a16",
    size: 648778,
    challenges: [
      "3d4902d172e1a6252af6a41a19021dbbd46329afd2c1154276f3e531b7d8a990",
      "149e4d99637d1421410ef8cfc03ad434632866368b53080bfeaa77f010945df1",
      "66c2025af4e4dae4dc6f1c56f18967205ada8dbb73db7916a936a285e8498a89",
      "97f307cbfe696c9286b70139712dd7472dcb8982cf3b08f11b3ee0ccf4c821b4",
    ],
    tree: [
      "933cb36cb78fbf04e5a9cdde1feb9cc66f561cf6",
      "3df01a8543cbade1df00809e42efaa04b3cea5a9",
      "33cd67ae33287828cd1e74793fee14f85622fc88",
      "20dbbdf80ba83dfb5ae65d55b1206d7919808e26",
    ],
    parity: false,
    frame: new ObjectId("6294dc39d716b2000771e856"),
  },
  {
    _id: new ObjectId("6294dc399a7a0b0007226831"),
    index: 0,
    hash: "eac3fef365682d026fa7450cd7fe8d9a42d26a16",
    size: 648778,
    challenges: [
      "3d4902d172e1a6252af6a41a19021dbbd46329afd2c1154276f3e531b7d8a990",
      "149e4d99637d1421410ef8cfc03ad434632866368b53080bfeaa77f010945df1",
      "66c2025af4e4dae4dc6f1c56f18967205ada8dbb73db7916a936a285e8498a89",
      "97f307cbfe696c9286b70139712dd7472dcb8982cf3b08f11b3ee0ccf4c821b4",
    ],
    tree: [
      "933cb36cb78fbf04e5a9cdde1feb9cc66f561cf6",
      "3df01a8543cbade1df00809e42efaa04b3cea5a9",
      "33cd67ae33287828cd1e74793fee14f85622fc88",
      "20dbbdf80ba83dfb5ae65d55b1206d7919808e26",
    ],
    parity: false,
    frame: new ObjectId("6294dc39d716b2000771e856"),
  },
  {
    _id: new ObjectId("6294dc39b225f500068d2da4"),
    index: 0,
    hash: "bac3fef365682d026fa7450cd7fe8d9a42d26a16",
    size: 648778,
    challenges: [
      "3d4902d172e1a6252af6a41a19021dbbd46329afd2c1154276f3e531b7d8a990",
      "149e4d99637d1421410ef8cfc03ad434632866368b53080bfeaa77f010945df1",
      "66c2025af4e4dae4dc6f1c56f18967205ada8dbb73db7916a936a285e8498a89",
      "97f307cbfe696c9286b70139712dd7472dcb8982cf3b08f11b3ee0ccf4c821b4",
    ],
    tree: [
      "933cb36cb78fbf04e5a9cdde1feb9cc66f561cf6",
      "3df01a8543cbade1df00809e42efaa04b3cea5a9",
      "33cd67ae33287828cd1e74793fee14f85622fc88",
      "20dbbdf80ba83dfb5ae65d55b1206d7919808e26",
    ],
    parity: false,
    frame: new ObjectId("6294dc39d716b2000771e856"),
  },
];

export const pointers: MongoPointerModel[] = pointersTest;
