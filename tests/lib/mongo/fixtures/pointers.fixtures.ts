import { ObjectId } from 'mongodb';

export const pointerIds = [
  new ObjectId('6294dc394329da00076670d5'),
  new ObjectId('6294dc3993fbb80008aa83e4'),
  new ObjectId('6294dc399a7a0b0007226831'),
  new ObjectId('6294dc39b225f500068d2da4'),
  new ObjectId('6294dc39b225f500068d2da5'),
];
import { Pointer } from '../../../../lib/core/pointers/Pointer';
import { frameIds, frames } from './frames.fixtures';
import { shards } from './shards.fixtures';

type MongoPointerModel = Required<Omit<Pointer, 'id' | 'frame'>> & {
  _id: ObjectId;
  frame: ObjectId;
};

const formatPointer = ({ _id, ...model }: MongoPointerModel): Pointer => ({
  ...model,
  id: _id.toString(),
  frame: model.frame.toString(),
});

const pointersTest: MongoPointerModel[] = [
  {
    _id: pointerIds[0],
    index: 0,
    hash: shards[0].hash,
    size: 648778,
    challenges: [
      '3d4902d172e1a6252af6a41a19021dbbd46329afd2c1154276f3e531b7d8a990',
      '149e4d99637d1421410ef8cfc03ad434632866368b53080bfeaa77f010945df1',
      '66c2025af4e4dae4dc6f1c56f18967205ada8dbb73db7916a936a285e8498a89',
      '97f307cbfe696c9286b70139712dd7472dcb8982cf3b08f11b3ee0ccf4c821b4',
    ],
    tree: [
      '933cb36cb78fbf04e5a9cdde1feb9cc66f561cf6',
      '3df01a8543cbade1df00809e42efaa04b3cea5a9',
      '33cd67ae33287828cd1e74793fee14f85622fc88',
      '20dbbdf80ba83dfb5ae65d55b1206d7919808e26',
    ],
    parity: false,
    frame: frameIds[0],
  },
  {
    _id: pointerIds[1],
    index: 0,
    hash: shards[1].hash,
    size: 648778,
    challenges: [
      '3d4902d172e1a6252af6a41a19021dbbd46329afd2c1154276f3e531b7d8a990',
      '149e4d99637d1421410ef8cfc03ad434632866368b53080bfeaa77f010945df1',
      '66c2025af4e4dae4dc6f1c56f18967205ada8dbb73db7916a936a285e8498a89',
      '97f307cbfe696c9286b70139712dd7472dcb8982cf3b08f11b3ee0ccf4c821b4',
    ],
    tree: [
      '933cb36cb78fbf04e5a9cdde1feb9cc66f561cf6',
      '3df01a8543cbade1df00809e42efaa04b3cea5a9',
      '33cd67ae33287828cd1e74793fee14f85622fc88',
      '20dbbdf80ba83dfb5ae65d55b1206d7919808e26',
    ],
    parity: false,
    frame: frameIds[0],
  },
  {
    _id: pointerIds[2],
    index: 0,
    hash: shards[2].hash,
    size: 648778,
    challenges: [
      '3d4902d172e1a6252af6a41a19021dbbd46329afd2c1154276f3e531b7d8a990',
      '149e4d99637d1421410ef8cfc03ad434632866368b53080bfeaa77f010945df1',
      '66c2025af4e4dae4dc6f1c56f18967205ada8dbb73db7916a936a285e8498a89',
      '97f307cbfe696c9286b70139712dd7472dcb8982cf3b08f11b3ee0ccf4c821b4',
    ],
    tree: [
      '933cb36cb78fbf04e5a9cdde1feb9cc66f561cf6',
      '3df01a8543cbade1df00809e42efaa04b3cea5a9',
      '33cd67ae33287828cd1e74793fee14f85622fc88',
      '20dbbdf80ba83dfb5ae65d55b1206d7919808e26',
    ],
    parity: false,
    frame: frameIds[0],
  },
  {
    _id: pointerIds[3],
    index: 0,
    hash: shards[3].hash,
    size: 648778,
    challenges: [
      '3d4902d172e1a6252af6a41a19021dbbd46329afd2c1154276f3e531b7d8a990',
      '149e4d99637d1421410ef8cfc03ad434632866368b53080bfeaa77f010945df1',
      '66c2025af4e4dae4dc6f1c56f18967205ada8dbb73db7916a936a285e8498a89',
      '97f307cbfe696c9286b70139712dd7472dcb8982cf3b08f11b3ee0ccf4c821b4',
    ],
    tree: [
      '933cb36cb78fbf04e5a9cdde1feb9cc66f561cf6',
      '3df01a8543cbade1df00809e42efaa04b3cea5a9',
      '33cd67ae33287828cd1e74793fee14f85622fc88',
      '20dbbdf80ba83dfb5ae65d55b1206d7919808e26',
    ],
    parity: false,
    frame: frameIds[0],
  },
  {
    _id: pointerIds[4],
    index: 0,
    hash: shards[4].hash,
    size: 448778,
    challenges: [
      '3d4902d172e1a6252af6a41a19021dbbd46329afd2c1154276f3e531b7d8a990',
      '149e4d99637d1421410ef8cfc03ad434632866368b53080bfeaa77f010945df1',
      '66c2025af4e4dae4dc6f1c56f18967205ada8dbb73db7916a936a285e8498a89',
      '97f307cbfe696c9286b70139712dd7472dcb8982cf3b08f11b3ee0ccf4c821b4',
    ],
    tree: [
      '933cb36cb78fbf04e5a9cdde1feb9cc66f561cf6',
      '3df01a8543cbade1df00809e42efaa04b3cea5a9',
      '33cd67ae33287828cd1e74793fee14f85622fc88',
      '20dbbdf80ba83dfb5ae65d55b1206d7919808e26',
    ],
    parity: false,
    frame: frameIds[1],
  },
];

export const pointers: MongoPointerModel[] = pointersTest;
export const pointerFixtures: Pointer[] = pointersTest.map(formatPointer);
