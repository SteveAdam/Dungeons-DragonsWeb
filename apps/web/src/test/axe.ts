import axe from 'axe-core';

/**
 * Accessibility problems axe finds in a rendered element. Colour contrast is left out: jsdom does no layout or
 * painting, so axe cannot measure it there (the contrast table in the README covers the theme's colours).
 */
export async function axeViolations(node: Element) {
  const result = await axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map(v => `${v.id}: ${v.help} (${v.nodes.map(n => n.target.join(' ')).join(', ')})`);
}
