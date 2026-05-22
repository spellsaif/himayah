import type { AuthPlugin, AuthResult, PluginContext } from "@himayah/core";
import { parseCookies, serializeCookie } from "@himayah/session";

export interface OrganizationPluginOptions {
  // Config optional
}

export function organizationPlugin(options?: OrganizationPluginOptions): AuthPlugin {
  return {
    name: "org",
    init(ctx: PluginContext) {
      const userAdapter = ctx.userAdapter;
      // The OrgAdapter interface is expected to be merged in userAdapter context
      const orgAdapter = ctx.userAdapter as any;
      const sessionStore = ctx.sessionStore;
      const cookieName = ctx.cookieName || "himayah.sid";
      const cookieOptions = ctx.cookieOptions || { maxAge: 30 * 24 * 60 * 60, path: "/" };

      if (!orgAdapter || typeof orgAdapter.createOrg !== "function") {
        throw new Error("Organization plugin requires an adapter implementing OrgAdapter.");
      }

      // Helper to get active session
      const getSessionData = async (req: Request): Promise<{ userId: string; user: any; sessionPayload: any } | null> => {
        const cookies = parseCookies(req.headers.get("cookie"));
        const token = cookies[cookieName];
        if (!token) return null;
        const payload = await sessionStore.verify(token);
        if (!payload || !payload.userId) return null;
        return {
          userId: payload.userId,
          user: payload.user,
          sessionPayload: payload
        };
      };

      const create = async (name: string, req: Request): Promise<AuthResult<any>> => {
        try {
          const session = await getSessionData(req);
          if (!session) {
            return {
              ok: false,
              error: { code: "unauthorized", message: "You must be signed in to create an organization" }
            };
          }

          const org = await orgAdapter.createOrg(name, session.userId);
          await orgAdapter.addMember(org.id, session.userId, "admin");

          // Auto-switch to the new organization
          const newPayload = { ...session.sessionPayload, activeOrgId: org.id };
          const sessionToken = await sessionStore.create(newPayload);

          return {
            ok: true,
            data: {
              org,
              sessionToken
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "create_failed", message: err.message || "Failed to create organization" }
          };
        }
      };

      const switchOrg = async (orgId: string, req: Request): Promise<AuthResult<any>> => {
        try {
          const session = await getSessionData(req);
          if (!session) {
            return {
              ok: false,
              error: { code: "unauthorized", message: "You must be signed in to switch organizations" }
            };
          }

          // Verify membership
          const member = await orgAdapter.findMember(orgId, session.userId);
          if (!member) {
            return {
              ok: false,
              error: { code: "forbidden", message: "You are not a member of this organization" }
            };
          }

          // Update activeOrgId in session
          const newPayload = { ...session.sessionPayload, activeOrgId: orgId };
          const sessionToken = await sessionStore.create(newPayload);

          return {
            ok: true,
            data: {
              activeOrgId: orgId,
              sessionToken
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "switch_failed", message: err.message || "Failed to switch organization" }
          };
        }
      };

      const invite = async (
        input: { orgId: string; email: string; role?: string },
        req: Request
      ): Promise<AuthResult<any>> => {
        try {
          const session = await getSessionData(req);
          if (!session) {
            return {
              ok: false,
              error: { code: "unauthorized", message: "You must be signed in to invite members" }
            };
          }

          const role = input.role || "member";

          // Verify that caller is admin
          const caller = await orgAdapter.findMember(input.orgId, session.userId);
          if (!caller || caller.role !== "admin") {
            return {
              ok: false,
              error: { code: "forbidden", message: "Only organization administrators can invite members" }
            };
          }

          const token = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

          const invitation = await orgAdapter.createInvitation({
            email: input.email,
            orgId: input.orgId,
            role,
            token,
            expiresAt
          });

          return {
            ok: true,
            data: {
              invitation
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "invite_failed", message: err.message || "Failed to invite member" }
          };
        }
      };

      const acceptInvite = async (token: string, req: Request): Promise<AuthResult<any>> => {
        try {
          const session = await getSessionData(req);
          if (!session) {
            return {
              ok: false,
              error: { code: "unauthorized", message: "You must be signed in to accept invitations" }
            };
          }

          const inviteRecord = await orgAdapter.findInvitation(token);
          if (!inviteRecord) {
            return {
              ok: false,
              error: { code: "invalid_invitation", message: "Invitation not found or invalid" }
            };
          }

          if (new Date() > inviteRecord.expiresAt) {
            await orgAdapter.deleteInvitation(token).catch(() => {});
            return {
              ok: false,
              error: { code: "invitation_expired", message: "Invitation has expired" }
            };
          }

          // Security check: verification matching user email
          if (session.user.email !== inviteRecord.email) {
            return {
              ok: false,
              error: { code: "forbidden", message: "This invitation was sent to a different email address" }
            };
          }

          // Add member
          const member = await orgAdapter.addMember(inviteRecord.orgId, session.userId, inviteRecord.role);
          await orgAdapter.deleteInvitation(token).catch(() => {});

          // Switch user context to accepted org
          const newPayload = { ...session.sessionPayload, activeOrgId: inviteRecord.orgId };
          const sessionToken = await sessionStore.create(newPayload);

          return {
            ok: true,
            data: {
              member,
              sessionToken
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "accept_failed", message: err.message || "Failed to accept invitation" }
          };
        }
      };

      const listMembers = async (orgId: string, req: Request): Promise<AuthResult<any>> => {
        try {
          const session = await getSessionData(req);
          if (!session) {
            return {
              ok: false,
              error: { code: "unauthorized", message: "You must be signed in" }
            };
          }

          // Check membership
          const caller = await orgAdapter.findMember(orgId, session.userId);
          if (!caller) {
            return {
              ok: false,
              error: { code: "forbidden", message: "You are not a member of this organization" }
            };
          }

          const members = await orgAdapter.listMembers(orgId);
          return {
            ok: true,
            data: {
              members
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "list_members_failed", message: err.message || "Failed to list members" }
          };
        }
      };

      const removeMember = async (orgId: string, memberUserId: string, req: Request): Promise<AuthResult<any>> => {
        try {
          const session = await getSessionData(req);
          if (!session) {
            return {
              ok: false,
              error: { code: "unauthorized", message: "You must be signed in" }
            };
          }

          const caller = await orgAdapter.findMember(orgId, session.userId);
          if (!caller || caller.role !== "admin") {
            return {
              ok: false,
              error: { code: "forbidden", message: "Only administrators can remove members" }
            };
          }

          await orgAdapter.removeMember(orgId, memberUserId);
          return {
            ok: true,
            data: {
              message: "Member removed successfully"
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "remove_failed", message: err.message || "Failed to remove member" }
          };
        }
      };

      const listOrgs = async (req: Request): Promise<AuthResult<any>> => {
        try {
          const session = await getSessionData(req);
          if (!session) {
            return {
              ok: false,
              error: { code: "unauthorized", message: "You must be signed in" }
            };
          }

          const orgs = await orgAdapter.listUserOrgs(session.userId);
          return {
            ok: true,
            data: {
              orgs
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "list_failed", message: err.message || "Failed to list organizations" }
          };
        }
      };

      return {
        handlers: {
          create,
          switchOrg,
          invite,
          acceptInvite,
          listMembers,
          removeMember,
          listOrgs,
        },
        routes: {
          "create": async (req: Request) => {
            try {
              const body = await req.json();
              const result = await create(body.name, req);
              return {
                status: result.ok ? 200 : 400,
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          },
          "switch": async (req: Request) => {
            try {
              const body = await req.json();
              const result = await switchOrg(body.orgId, req);
              return {
                status: result.ok ? 200 : 400,
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          },
          "invite": async (req: Request) => {
            try {
              const body = await req.json();
              const result = await invite(body, req);
              return {
                status: result.ok ? 200 : 400,
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          },
          "accept-invite": async (req: Request) => {
            try {
              const body = await req.json();
              const result = await acceptInvite(body.token, req);
              return {
                status: result.ok ? 200 : 400,
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          },
          "members": async (req: Request) => {
            try {
              const reqUrl = new URL(req.url);
              const orgId = reqUrl.searchParams.get("orgId");
              if (!orgId) {
                return new Response("Missing orgId parameter", { status: 400 });
              }
              const result = await listMembers(orgId, req);
              return {
                status: result.ok ? 200 : 400,
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          },
          "list": async (req: Request) => {
            try {
              const result = await listOrgs(req);
              return {
                status: result.ok ? 200 : 400,
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          }
        }
      };
    }
  };
}
