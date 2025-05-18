// src/handlers/cadastro.ts

import { bot } from '../bot'; // Ajuste o caminho conforme seu projeto
import { validarEmail, validarCPF, validarCNPJ, validarSenha } from '../utils/validacao';
import { salvarUsuario } from '../db';
import { enviarCodigo } from '../mail';
import { userSessions } from '../bot';
import { Message } from 'node-telegram-bot-api';

interface CadastroState {
  etapa: number;
  nome?: string;
  email?: string;
  codigo?: string;
  cpf?: string;
  cnpj?: string;
  senha?: string;
  endereco_cpf?: string;
  endereco_cnpj?: string;
  imagem_doc_id?: string;
  comprovante_residencia_id?: string;
  lastActivity: number;
  senha_confirmar?: string;
}

export const HandlersCadastro = {
  iniciar: async (chatId: number) => {
    userSessions.set(chatId, { etapa: 1, lastActivity: Date.now() });
    await bot.sendMessage(chatId, 'Bem-vindo ao cadastro! Qual o seu nome completo?');
  },

  processarEtapa: async (msg: Message, session: CadastroState) => {
    const chatId = msg.chat.id;
    const etapa = session.etapa || 1;
    const text = msg.text?.trim();

    switch (etapa) {
      case 1: // Nome
        if (!text || text.length < 3) {
          await bot.sendMessage(chatId, 'Nome inválido. Por favor, digite seu nome completo:');
          return;
        }
        session.nome = text;
        session.etapa = 2;
        await bot.sendMessage(chatId, 'Digite seu e-mail:');
        break;

      case 2: // Email
        if (!validarEmail(text!)) {
          await bot.sendMessage(chatId, 'E-mail inválido. Digite novamente:');
          return;
        }
        session.email = text!;
        session.etapa = 3;
        session.codigo = String(Math.floor(100000 + Math.random() * 900000)); // Gera código de 6 dígitos
        await enviarCodigo(session.email, session.codigo);
        await bot.sendMessage(chatId, 'Um código foi enviado para seu e-mail. Digite o código recebido:');
        break;

      case 3: // Código de confirmação
        if (text !== session.codigo) {
          await bot.sendMessage(chatId, 'Código incorreto! Digite o código que recebeu no e-mail:');
          return;
        }
        session.etapa = 4;
        await bot.sendMessage(chatId, 'Digite seu CPF (apenas números, obrigatório):');
        break;

       case 4: // CPF (obrigatório)
        if (!validarCPF(text!)) {
          await bot.sendMessage(chatId, 'CPF inválido. Digite novamente (somente números):');
          return;
        }
        session.cpf = text!; // <-- Só CPF
        session.etapa = 41;
        await bot.sendMessage(
          chatId,
          'Deseja adicionar um CNPJ? (opcional)\n\nResponda "sim" para adicionar ou "não" para pular.'
        );
        break;

      case 41: // Pergunta sobre CNPJ
        if (text?.toLowerCase() === 'sim') {
          session.etapa = 42;
          await bot.sendMessage(chatId, 'Digite seu CNPJ (somente números):');
        } else if (text?.toLowerCase() === 'não' || text?.toLowerCase() === 'nao' || text?.toLowerCase() === 'n') {
          session.etapa = 6; // Pular CNPJ
          await bot.sendMessage(chatId, 'Envie uma foto do seu documento (frente):');
        } else {
          await bot.sendMessage(chatId, 'Responda apenas com "sim" ou "não":');
        }
        break;

      case 42: // CNPJ (opcional)
        if (!validarCNPJ(text!)) {
          await bot.sendMessage(chatId, 'CNPJ inválido. Digite novamente ou envie "não" para pular.');
          return;
        }
        session.cnpj = text!;
        session.etapa = 6;
        await bot.sendMessage(chatId, 'Envie uma foto do seu documento (frente):');
        break;

      case 6: // Foto do documento
        await bot.sendMessage(chatId, 'Por favor, envie a foto do seu documento (como uma foto):');
        // Quando receber photo, o handler processarDocumento será chamado!
        break;

      case 7: // Comprovante de residência
        await bot.sendMessage(chatId, 'Por favor, envie a foto do seu comprovante de residência:');
        // Quando receber photo, o handler processarDocumento será chamado!
        break;

      case 8: // Endereço
        if (!text || text.length < 8) {
          await bot.sendMessage(chatId, 'Endereço muito curto. Digite o endereço completo, igual ao do comprovante:');
          return;
        }
        session.endereco_cpf = text;
        session.etapa = 9;
        await bot.sendMessage(chatId, 'Agora crie uma senha (mínimo 6 caracteres):');
        break;

      case 9: // Senha
        if (!validarSenha(text!)) {
          await bot.sendMessage(chatId, 'Senha fraca. Digite uma senha com pelo menos 6 caracteres:');
          return;
        }
        session.senha = text!;
        session.etapa = 10;
        await bot.sendMessage(chatId, 'Confirme a senha digitando novamente:');
        break;

      case 10: // Confirmação de senha
        if (text !== session.senha) {
          await bot.sendMessage(chatId, 'Senhas não coincidem! Digite sua senha novamente:');
          session.etapa = 9; // Volta para digitar senha de novo
          return;
        }
        // Finaliza o cadastro
        await salvarUsuario({
          nome: session.nome!,
          email: session.email!,
          cpf: session.cpf!,
          cnpj: session.cnpj || undefined, // Use undefined, não null!
          senha: session.senha!, // Hash no banco!
          chat_id: chatId,
          imagem_doc_id: session.imagem_doc_id!,
          comprovante_residencia_id: session.comprovante_residencia_id!,
          endereco_cpf: session.endereco_cpf!,
          endereco_cnpj: session.cnpj ? session.endereco_cnpj || '' : '',
        });
        userSessions.delete(chatId);
        await bot.sendMessage(chatId, '✅ Cadastro finalizado! Agora você pode usar o sistema.');
        break;

      default:
        await bot.sendMessage(chatId, 'Erro de etapa. Tente iniciar o cadastro novamente.');
        userSessions.delete(chatId);
        break;
    }

    session.lastActivity = Date.now();
    userSessions.set(chatId, session);
  },

  // Foto do documento ou comprovante
  processarDocumento: async (chatId: number, session: CadastroState, fileId: string) => {
    if (session.etapa === 6) {
      session.imagem_doc_id = fileId;
      session.etapa = 7;
      await bot.sendMessage(chatId, 'Foto do documento recebida! Agora envie uma foto do comprovante de residência:');
    } else if (session.etapa === 7) {
      session.comprovante_residencia_id = fileId;
      session.etapa = 8;
      await bot.sendMessage(
        chatId,
        'Comprovante recebido! Agora digite o endereço completo, igual ao do comprovante:'
      );
    }
    session.lastActivity = Date.now();
    userSessions.set(chatId, session);
  }
};
