import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "./app/workspace.css";
import { AppShell } from "@/components/sites/kanban/AppShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "STI-OS | Órdenes de Servicio y Proyectos STI",
  description:
    "Gestión de proyectos, órdenes de servicio técnico y mantenimiento - STI Sistemas",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="sti-theme-init"
          strategy="beforeInteractive"
        >{`(function(){try{var p=localStorage.getItem('sti-theme');var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})();`}</Script>
      </head>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
