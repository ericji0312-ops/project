import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSession } from "@/lib/session";
import LogoutButton from "@/components/LogoutButton";
import NavLinks from "@/components/NavLinks";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "학습스케줄 배정",
  description: "학습스케줄 배정 웹앱",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {session && (
          <nav className="flex items-center justify-between gap-4 border-b px-6 py-3 text-sm font-medium">
            <NavLinks isAdmin={session.role === "admin"} />
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {session.role === "admin" ? "관리자" : `${session.teacherName} 선생님`}
              </span>
              <LogoutButton />
            </div>
          </nav>
        )}
        {children}
      </body>
    </html>
  );
}
