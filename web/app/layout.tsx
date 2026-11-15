import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import './globals.css'

const noto = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '700'] })

export const metadata: Metadata = { title: 'CareDrive', description: '부모님의 운전 변화를 가족이 놓치지 않게' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={noto.className}>{children}</body>
    </html>
  )
}
