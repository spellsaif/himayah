import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span className="flex items-center gap-2 font-bold text-base">
        <img src="/himayah/logo.png" alt="Himayah Logo" className="w-6 h-6 object-contain rounded-md" />
        <span>Himayah</span>
      </span>
    ),
    url: '/',
  },
  githubUrl: 'https://github.com/spellsaif/himayah',
  links: [
    {
      text: 'Docs',
      url: '/docs',
      active: 'nested-url',
    },
    {
      text: 'Getting Started',
      url: '/docs/getting-started',
    },
    {
      text: 'Security',
      url: '/docs/security-audit',
    },
  ],
};
