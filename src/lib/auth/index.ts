import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { ac, roles } from "./permissions";

export const auth = betterAuth({
  appName: "Imperium Tec Refrigeração",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Contas são criadas pela empresa (técnicos e clientes); não há cadastro público.
    disableSignUp: true,
    minPasswordLength: 6,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // cache curto: bloqueio de acesso vale em até 1 minuto
    cookieCache: { enabled: true, maxAge: 60 },
  },
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL, process.env.BETTER_AUTH_URL].filter(
    (v): v is string => Boolean(v),
  ),
  plugins: [
    admin({
      ac,
      roles,
      adminRoles: ["admin", "gestor"],
      defaultRole: "cliente",
      bannedUserMessage: "Seu acesso está bloqueado. Fale com a Imperium.",
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
