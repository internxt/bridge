import { Command } from 'commander';
import { config } from 'dotenv';
config();
import EventEmitter from 'events';

import getCommands from './commands';
import { prepare } from './init';

const program = new Command();
const emitter = new EventEmitter();

async function main() {
  const finishPromise = new Promise(r => emitter.once('command:finished', r));

  console.log('Preparing resources...');

  const resources = await prepare();

  console.log('Resources prepared!');

  console.log('Preparing commands...');

  const commands = getCommands(resources, () => emitter.emit('command:finished'));

  for (const commandKey of Object.keys(commands)) {
    const command = commands[commandKey];

    program.addCommand(command);
  }

  console.log('Commands prepared! Executing...');

  program.parse(process.argv);

  await finishPromise;
}

main().then(() => {
  console.log('Execution finished. Program exit success.');

  process.exit(0);
}).catch((err) => {
  console.warn('Program exit with error.');
  console.error(err);

  process.exit(1);
});
