import { EmptyState } from '../../components/EmptyState';

export function ComingSoonTab({ name }: { name: string }) {
  return <EmptyState title="Coming soon">{`The ${name} section is still being built.`}</EmptyState>;
}
