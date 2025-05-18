// src/handlers/login.ts

import { bot } from '../bot';
import { verificarCredenciais } from '../db';
import { userSessions, loggedInUsers } from '../bot';
import { Message } from 'node-telegram-bot-api';

interface LoginState {
  etapa: number;
  email?: string;
  lastActivity: number;
}

// Objeto para guardar as sessões de login em andamento
export const loginSessions = new Map<number, LoginState>();

export const HandlersLogin = {
  iniciar: async (chatId: number) => {
    loginSessions.set(chatId, { etapa: 1, lastActivity: Date.now() });
    await bot.sendMessage(chatId, 'Digite seu e-mail para login:');
  },

  processarEtapa: async (msg: Message, session: LoginState) => {
    const chatId = msg.chat.id;
    const etapa = session.etapa || 1;
    const text = msg.text?.trim();

    switch (etapa) {
      case 1: // E-mail
        if (!text || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
          await bot.sendMessage(chatId, 'E-mail inválido. Digite novamente:');
          return;
        }
        session.email = text;
        session.etapa = 2;
        await bot.sendMessage(chatId, 'Digite sua senha:');
        break;

      case 2: // Senha
        if (!text || text.length < 3) {
          await bot.sendMessage(chatId, 'Senha inválida. Digite novamente:');
          return;
        }
        // Verifica credenciais usando o banco
        const usuario = await verificarCredenciais(session.email!, text);
        if (!usuario) {
          await bot.sendMessage(chatId, 'E-mail ou senha incorretos! Tente novamente ou digite /start para voltar ao menu.');
          loginSessions.delete(chatId);
          return;
        }
        // Marca como logado
        loggedInUsers.set(chatId, usuario.id!);
        await bot.sendMessage(chatId, `✅ Login realizado com sucesso! Bem-vindo(a), ${usuario.nome}.`);
        loginSessions.delete(chatId);
        break;

      default:
        await bot.sendMessage(chatId, 'Fluxo de login interrompido. Digite /start para tentar novamente.');
        loginSessions.delete(chatId);
        break;
    }

    session.lastActivity = Date.now();
    loginSessions.set(chatId, session);
  }
};