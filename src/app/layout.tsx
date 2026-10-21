import type { Metadata, Viewport } from "next";
import { Cinzel, IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Imperium Tec Refrigeração",
    template: "%s · Imperium",
  },
  description: "Gestão de clientes, planos de manutenção, OMs, estoque e financeiro da Imperium Tec Refrigeração.",
  applicationName: "Imperium",
  appleWebApp: { capable: true, title: "Imperium", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#040914",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`dark ${cinzel.variable} ${plex.variable} h-full`}>
      <body className="min-h-full">
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
