/** Traduz os erros do Better Auth (plugin admin) para mensagens em português. */
const MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: "Já existe um acesso com este e-mail. Use outro e-mail ou redefina a senha do acesso existente.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Já existe um acesso com este e-mail. Use outro e-mail ou redefina a senha do acesso existente.",
  INVALID_EMAIL: "E-mail inválido. Confira o endereço digitado.",
  PASSWORD_TOO_SHORT: "A senha está curta demais. Use pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "A senha está longa demais. Use até 128 caracteres.",
  USER_NOT_FOUND: "Este acesso não existe mais. Atualize a página.",
  YOU_CANNOT_BAN_YOURSELF: "Você não pode bloquear o próprio acesso.",
  YOU_CANNOT_REMOVE_YOURSELF: "Você não pode excluir o próprio acesso.",
  YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: "Perfil inválido.",
  FAILED_TO_CREATE_USER: "Não foi possível criar o acesso. Tente novamente.",
};

export function authErrorMessage(e: unknown, fallback = "Não foi possível concluir. Tente novamente.") {
  if (e && typeof e === "object") {
    const body = (e as { body?: { code?: string; message?: string } }).body;
    const code = body?.code;
    if (code && MESSAGES[code]) return MESSAGES[code];
    const status = (e as { status?: string | number }).status;
    if (status === "FORBIDDEN" || status === 403) return "Você não tem permissão para esta ação.";
    if (status === "UNAUTHORIZED" || status === 401) return "Sessão expirada. Entre novamente.";
    // Erros de regra (assertRole, validações locais) já vêm em português
    if (e instanceof Error && !body) return e.message;
  }
  return fallback;
}
