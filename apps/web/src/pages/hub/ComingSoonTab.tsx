import { EmptyState } from '../../components/EmptyState';

export function ComingSoonTab({ name }: { name: string }) {
  return <EmptyState title="Coming soon" icon="hourglass">{`The ${name} section is still being built.`}</EmptyState>;
}
