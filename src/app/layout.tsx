import type { Metadata, Viewport } from "next";
import { Cinzel, IBM_Plex_Sans } from "next/font/google";
import { MotionProvider } from "@/components/brand/motion-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { themeClass, themeColors } from "@/lib/theme";
import { getThemePreference } from "@/lib/theme-server";
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

export async function generateViewport(): Promise<Viewport> {
  const pref = await getThemePreference();
  const colors = themeColors(pref);
  return {
    // sempre as duas metas: o tema-provider só troca as cores, sem criar/remover nós
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: colors.light },
      { media: "(prefers-color-scheme: dark)", color: colors.dark },
    ],
    colorScheme: pref === "system" ? "light dark" : pref,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const pref = await getThemePreference();
  return (
    <html lang="pt-BR" className={`${themeClass(pref)} ${cinzel.variable} ${plex.variable} h-full`}>
      <body className="min-h-full">
        <ThemeProvider initial={pref}>
          <MotionProvider>
            <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
          </MotionProvider>
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
        {/* App instalado no iPhone: relógio e bateria ficam sempre brancos (black-translucent).
            No tema claro, uma faixa azul-noite do tamanho da barra de status os mantém legíveis. */}
        <div
          aria-hidden
          className="no-print pointer-events-none fixed inset-x-0 top-0 z-[60] hidden h-[env(safe-area-inset-top)] bg-[#0b1730] light:block"
        />
      </body>
    </html>
  );
}
