import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

export const roles = {
  admin: ac.newRole({ ...adminAc.statements }),
  gestor: ac.newRole({ ...adminAc.statements }),
  tecnico: ac.newRole({ ...userAc.statements }),
  cliente: ac.newRole({ ...userAc.statements }),
};
