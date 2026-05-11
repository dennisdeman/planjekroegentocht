import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getClient, getSchema, ensureMigrations } from "./postgres-storage";
import { findUserByEmail, findOrganizationById, verifyPassword, listMembershipsForUser, getMembership } from "./db";
import { resolveOrgPlanState, SUPERADMIN_PLAN_STATE, type OrgPlanState } from "./plan-limits";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      activeOrgId: string;
      activeOrgName: string;
      activeOrgRole: "admin" | "member";
      isSuperadmin: boolean;
      planState: OrgPlanState;
    };
  }

  interface User {
    id?: string;
    email?: string | null;
    name?: string | null;
  }
}

const config: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 uur
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Wachtwoord", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        await ensureMigrations();
        const client = getClient();
        const schema = getSchema();

        const user = await findUserByEmail(client, schema, email);
        if (!user || !user.password_hash) {
          return null;
        }

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
          return null;
        }

        if (!user.email_verified_at) {
          // Return null — the login page does a pre-check via /api/auth/check-email
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!session?.user;
      const isAuthPage =
        pathname.startsWith("/login") ||
        pathname.startsWith("/register") ||
        pathname.startsWith("/invite");

      // Mollie webhook en cron moeten altijd toegankelijk zijn (geen auth)
      if (pathname === "/api/payments/webhook" || pathname.startsWith("/api/cron")) {
        return true;
      }

      if (isLoggedIn && isAuthPage) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      if (!isLoggedIn && !isAuthPage) {
        return false;
      }
      return true;
    },
    async jwt({ token, user, trigger, session: updateData }) {
      // Initial sign-in: populate token from user object
      if (user?.id) {
        token.userId = user.id;
        token.email = user.email ?? "";
        token.name = user.name ?? "";

        await ensureMigrations();
        const client2 = getClient();
        const schema2 = getSchema();
        const fullUser = await findUserByEmail(client2, schema2, user.email ?? "");
        token.isSuperadmin = fullUser?.is_superadmin === true;

        await ensureMigrations();
        const client = getClient();
        const schema = getSchema();
        const memberships = await listMembershipsForUser(client, schema, user.id);
        if (memberships.length > 0) {
          token.activeOrgId = memberships[0].org_id;
          token.activeOrgName = memberships[0].org_name;
          token.activeOrgRole = memberships[0].role;

          const org = await findOrganizationById(client, schema, memberships[0].org_id);
          if (org) {
            token.planState = token.isSuperadmin ? SUPERADMIN_PLAN_STATE : resolveOrgPlanState(org);
          }
        }
      }

      // Session update trigger: refresh plan state (na betaling) of switch active org
      if (trigger === "update" && !updateData?.activeOrgId && token.activeOrgId) {
        await ensureMigrations();
        const client = getClient();
        const schema = getSchema();
        const org = await findOrganizationById(client, schema, token.activeOrgId as string);
        if (org) {
          token.planState = token.isSuperadmin ? SUPERADMIN_PLAN_STATE : resolveOrgPlanState(org);
        }
      }

      if (trigger === "update" && updateData?.activeOrgId) {
        const requestedOrgId = updateData.activeOrgId as string;
        await ensureMigrations();
        const client = getClient();
        const schema = getSchema();
        const membership = await getMembership(client, schema, token.userId as string, requestedOrgId);
        if (membership) {
          // Find org name from memberships list
          const memberships = await listMembershipsForUser(client, schema, token.userId as string);
          const match = memberships.find((m) => m.org_id === requestedOrgId);
          token.activeOrgId = requestedOrgId;
          token.activeOrgName = match?.org_name ?? "";
          token.activeOrgRole = membership.role;

          const org = await findOrganizationById(client, schema, requestedOrgId);
          if (org) {
            token.planState = token.isSuperadmin ? SUPERADMIN_PLAN_STATE : resolveOrgPlanState(org);
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = session.user as any;
      user.id = token.userId;
      user.email = token.email;
      user.name = token.name;
      user.activeOrgId = token.activeOrgId;
      user.activeOrgName = token.activeOrgName;
      user.activeOrgRole = token.activeOrgRole;
      user.isSuperadmin = token.isSuperadmin === true;
      user.planState = token.planState ?? { plan: "free", status: "active", limits: { maxGroups: 8, maxActivePlannings: 1, canExport: false, canUseAdvice: false, canUseFullValidation: false, canSaveTemplates: false, maxTeamMembers: 1 }, expiresAt: null, trialExpiresAt: null };
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(config);
