import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Folder, FolderOpen, GripVertical, Library } from 'lucide-react';
import type { ReactNode } from 'react';
import { ICON_PROPS } from '../../../components/ui';
import { folderTarget, ROOT_TARGET, type FolderNode } from '../../../lib/entityTree';
import styles from './codex.module.css';

/** Which folder the list shows: every entity, the top level only, or one folder. */
export type FolderFilter = { kind: 'all' } | { kind: 'root' } | { kind: 'folder'; id: string };

interface Props {
  tree: FolderNode[];
  filter: FolderFilter;
  onFilter: (f: FolderFilter) => void;
  /** How many entities sit directly in each folder (key null: the top level). */
  counts: Map<string | null, number>;
}

function DropZone({ id, children }: { id: string; children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${styles.drop} ${isOver ? styles.dropOver : ''}`}>
      {children}
    </div>
  );
}

function FolderRow({ node, filter, onFilter, counts }: { node: FolderNode } & Omit<Props, 'tree'>) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-folder:${node.folder.id}`,
    data: { kind: 'folder', id: node.folder.id },
  });
  const selected = filter.kind === 'folder' && filter.id === node.folder.id;
  const Icon = selected ? FolderOpen : Folder;
  return (
    <li>
      <DropZone id={folderTarget(node.folder.id)}>
        <div
          ref={setNodeRef}
          className={`${styles.treeRow} ${isDragging ? styles.dragging : ''}`}
          style={{ paddingLeft: `${0.4 + node.depth * 1.1}rem` }}
        >
          {/* pointer-only handle: keyboard users move folders with "Move to…" in the folder's tools */}
          <span {...listeners} {...attributes} tabIndex={-1} aria-hidden="true" className={styles.grip}>
            <GripVertical {...ICON_PROPS} />
          </span>
          <button
            type="button"
            aria-pressed={selected}
            className={styles.treeButton}
            onClick={() => onFilter({ kind: 'folder', id: node.folder.id })}
          >
            <Icon {...ICON_PROPS} />
            {node.folder.name}
            <span className={styles.count}>{counts.get(node.folder.id) ?? 0}</span>
          </button>
        </div>
      </DropZone>
      {node.children.length > 0 && (
        <ul className={styles.tree}>
          {node.children.map(child => (
            <FolderRow key={child.folder.id} node={child} filter={filter} onFilter={onFilter} counts={counts} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The DM's folders: choose one to list its entities; drop entities or folders on one to move them there. */
export function FolderTree({ tree, filter, onFilter, counts }: Props) {
  return (
    <nav aria-label="Folders" className={styles.folders}>
      <button
        type="button"
        aria-pressed={filter.kind === 'all'}
        className={styles.treeButton}
        onClick={() => onFilter({ kind: 'all' })}
      >
        <Library {...ICON_PROPS} />
        All entities
      </button>
      <DropZone id={ROOT_TARGET}>
        <button
          type="button"
          aria-pressed={filter.kind === 'root'}
          className={styles.treeButton}
          onClick={() => onFilter({ kind: 'root' })}
        >
          <Folder {...ICON_PROPS} />
          Top level
          <span className={styles.count}>{counts.get(null) ?? 0}</span>
        </button>
      </DropZone>
      <ul className={styles.tree}>
        {tree.map(node => (
          <FolderRow key={node.folder.id} node={node} filter={filter} onFilter={onFilter} counts={counts} />
        ))}
      </ul>
    </nav>
  );
}
