import { Frame } from "../frames/Frame";

export interface Pointer {
  id: string;
  index: number;
  hash: string;
  size: number;
  frame: Frame['id'];
  challenges?: string[];
  tree?: string[];
  parity: boolean;
}
