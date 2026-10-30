export default function WikiLayout({ children }: { children: React.ReactNode }) {
  // One root for every wiki route: pages keep their own composition but share the
  // same surface and container variables. Navigation and search come from the site
  // shell only; a second wiki menu or search bar here would repeat them.
  return <div data-wiki-surface>{children}</div>;
}
