/** Traduz erros do Better Auth (APIError) em mensagens claras em português. */
export function authErrorMessage(e: unknown, fallback = "Não foi possível alterar o acesso. Tente novamente.") {
  const body = (e as { body?: { code?: string; message?: string } } | null)?.body;
  const code = body?.code ?? "";
  const map: Record<string, string> = {
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe um acesso com este e-mail. Use outro e-mail.",
    USER_ALREADY_EXISTS: "Já existe um acesso com este e-mail. Use outro e-mail.",
    INVALID_EMAIL: "E-mail inválido. Confira o endereço digitado.",
    PASSWORD_TOO_SHORT: "Senha muito curta: use pelo menos 6 caracteres.",
    PASSWORD_TOO_LONG: "Senha muito longa: use no máximo 128 caracteres.",
    USER_NOT_FOUND: "O usuário deste acesso não existe mais. Crie um novo acesso.",
    YOU_CANNOT_BAN_YOURSELF: "Você não pode bloquear o seu próprio acesso.",
    YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "Seu perfil não pode bloquear acessos.",
    YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: "Seu perfil não pode redefinir senhas.",
    YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "Seu perfil não pode criar acessos.",
  };
  if (map[code]) return map[code];
  if (e instanceof Error && /[áéíóúãõç]/i.test(e.message)) return e.message;
  return fallback;
}
