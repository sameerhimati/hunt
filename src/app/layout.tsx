import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import { JetBrains_Mono, Newsreader, Public_Sans } from 'next/font/google'

import './globals.css'

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'hunt',
  description:
    'The whole job hunt in one local-first app. Bring your own keys; your data never leaves your machine.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Dark is the shipped default — hunt is a private local workspace, not a
    // marketing surface. ThemeProvider writes the class before paint (so no
    // flash) and persists the ⌘K toggle; `system` is not offered, because the
    // light palette is a deliberate second theme, not an OS mirror.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
