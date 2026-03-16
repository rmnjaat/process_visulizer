import type { ProcessInfo } from './process';
import type { ThreadInfo } from './thread';

export interface TreeNode {
  entity_type: 'process' | 'thread';
  data: ProcessInfo | ThreadInfo;
  children: TreeNode[];
}
