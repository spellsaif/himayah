import Link from 'next/link';

const features = [
  {
    icon: '🔐',
    title: 'AES-256-GCM Sessions',
    description: 'Stateless JWE sessions encrypted client-side. Zero database round-trips on every request.',
  },
  {
    icon: '🧩',
    title: 'Plugin Composable',
    description: 'Mix and match password, OAuth, magic link, OTP, passkeys, and organizations. Pay only for what you use.',
  },
  {
    icon: '🗄️',
    title: 'Bring Your Own Schema',
    description: 'Define your tables with Drizzle, Prisma, or Kysely. Himayah never owns your migrations.',
  },
  {
    icon: '🌍',
    title: 'Runs Anywhere',
    description: 'Cloudflare Workers, Vercel Edge, Deno, Bun, Node.js. Pure Web Crypto — no native bindings.',
  },
  {
    icon: '🛡️',
    title: 'Secure by Default',
    description: 'CSRF double-submit, constant-time comparisons, PKCE for OAuth, host-header spoofing protection.',
  },
  {
    icon: '⚡',
    title: 'Type-Safe Client',
    description: 'First-class TypeScript throughout. The browser client is a fully typed proxy of your server config.',
  },
];

const quickStart = `import { createAuth } from "@himayah/core";
import { createJWTSessionStore } from "@himayah/session";
import { passwordPlugin } from "@himayah/plugin-password";
import { drizzleAdapter } from "@himayah/adapter-drizzle";

export const auth = createAuth({
  adapter: drizzleAdapter(db, { users }),
  sessionStore: createJWTSessionStore({
    secret: process.env.AUTH_SECRET!,
  }),
  plugins: [
    passwordPlugin({ getPasswordHash, setPasswordHash }),
  ],
  baseUrl: process.env.APP_URL!,
});`;

export default function HomePage() {
  return (
    <main className="flex flex-col min-h-screen bg-fd-background text-fd-foreground">

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-24 pb-20 text-center overflow-hidden">
        {/* Background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--fd-primary) / 0.15), transparent)',
          }}
        />

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full border border-fd-border bg-fd-card text-sm text-fd-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Open Source · MIT License
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Auth for TypeScript,{' '}
            <span className="text-fd-primary">done right.</span>
          </h1>

          <p className="text-lg sm:text-xl text-fd-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Himayah is a lightweight, schema-first authentication framework. You own your database, your schema, and your code. We handle the hard parts.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              id="hero-get-started"
              href="/docs"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-fd-primary text-fd-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Get Started →
            </Link>
            <Link
              id="hero-view-docs"
              href="/docs/architecture"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-fd-border text-fd-foreground font-semibold text-sm hover:bg-fd-accent transition-colors"
            >
              Read the Docs
            </Link>
            <a
              id="hero-github"
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-fd-border text-fd-foreground font-semibold text-sm hover:bg-fd-accent transition-colors"
            >
              ★ GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Code preview */}
      <section className="px-6 pb-16">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-xl overflow-hidden border border-fd-border bg-fd-card shadow-lg">
            <div className="flex items-center gap-2 px-4 py-3 bg-fd-muted border-b border-fd-border">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-3 text-xs text-fd-muted-foreground font-mono">lib/auth.ts</span>
            </div>
            <pre className="p-6 text-sm overflow-x-auto text-fd-foreground leading-relaxed">
              <code>{quickStart}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 border-t border-fd-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-3">Everything you need, nothing you don&apos;t</h2>
          <p className="text-fd-muted-foreground text-center mb-12 max-w-xl mx-auto">
            Himayah ships with production-grade security defaults and a composable plugin system.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="p-5 rounded-xl border border-fd-border bg-fd-card hover:border-fd-primary/50 transition-colors"
              >
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-fd-foreground mb-1">{f.title}</h3>
                <p className="text-sm text-fd-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="px-6 py-16 border-t border-fd-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-3">How does Himayah compare?</h2>
          <p className="text-fd-muted-foreground text-center mb-12 max-w-xl mx-auto">
            Different tools for different needs. Here&apos;s an honest look at the tradeoffs.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-fd-border rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-fd-muted border-b border-fd-border">
                  <th className="text-left px-4 py-3 font-semibold text-fd-foreground">Feature</th>
                  <th className="px-4 py-3 font-semibold text-fd-primary">Himayah</th>
                  <th className="px-4 py-3 font-semibold text-fd-muted-foreground">NextAuth.js</th>
                  <th className="px-4 py-3 font-semibold text-fd-muted-foreground">Lucia</th>
                  <th className="px-4 py-3 font-semibold text-fd-muted-foreground">Auth.js</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fd-border">
                {[
                  ['Schema ownership', '✅ Always yours', '⚠️ Adapter needed', '✅ Always yours', '⚠️ Adapter needed'],
                  ['Edge runtime', '✅ Native', '⚠️ Partial', '✅ Native', '✅ Native'],
                  ['Plugin composability', '✅ Full', '⚠️ Limited', '❌ DIY', '⚠️ Limited'],
                  ['Built-in OTP/Magic Link', '✅ Yes', '❌ No', '❌ No', '❌ No'],
                  ['Built-in Organizations', '✅ Yes', '❌ No', '❌ No', '❌ No'],
                  ['PKCE for OAuth', '✅ Yes', '✅ Yes', '❌ DIY', '✅ Yes'],
                  ['Framework agnostic', '✅ Yes', '❌ Next.js only', '✅ Yes', '✅ Yes'],
                ].map(([feature, ...vals]) => (
                  <tr key={feature} className="hover:bg-fd-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-fd-foreground">{feature}</td>
                    {vals.map((v, i) => (
                      <td key={i} className={`px-4 py-3 text-center ${i === 0 ? 'text-fd-primary font-medium' : 'text-fd-muted-foreground'}`}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 border-t border-fd-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to add auth to your app?</h2>
          <p className="text-fd-muted-foreground mb-8">
            Follow the getting started guide and have authentication running in under 10 minutes.
          </p>
          <Link
            id="cta-get-started"
            href="/docs/getting-started"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-fd-primary text-fd-primary-foreground font-semibold hover:opacity-90 transition-opacity"
          >
            Get Started for free →
          </Link>
        </div>
      </section>

    </main>
  );
}
