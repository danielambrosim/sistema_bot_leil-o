export class Validacao {
  static validarEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  static validarCPF(cpf: string): boolean {
    return /^\d{11}$/.test(cpf);
  }

  static validarCNPJ(cnpj: string): boolean {
    return /^\d{14}$/.test(cnpj);
  }

  static validarSenha(senha: string): boolean {
    return senha.length >= 6;
  }
}