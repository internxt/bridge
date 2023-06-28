import { Command } from 'commander';

export interface CommandOpts {
  version: string;
  command: string;
  name?: string;
  description: string;
  options: Option[];
}

interface Option {
  required?: boolean;
  flags: string;
  description?: string;
  defaultValue?: string | boolean;
}

export function buildCommand(opts: CommandOpts): Command {
  const command = new Command().command(opts.command).version(opts.version).description(opts.description);

  opts.options.forEach((option) => {
    if (option.required) {
      command.requiredOption(option.flags, option.description, option.defaultValue);
    } else {
      command.option(option.flags, option.description, option.defaultValue);
    }
  });

  return command;
}