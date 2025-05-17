import TelegramBot from 'node-telegram-bot-api';
import bcrypt from 'bcrypt';
import { bot, mainMenu, loggedInUsers, userSessions, ADMIN_CHAT_ID } from '../bot';
import { salvarUsuario } from '../db';
import { enviarCodigo } from '../mail';
import { Validacao } from '../utils/validacao';

export class HandlersCadastro {
  static async reiniciarCadastro(chatId: number): Promise<void> {
    userSessions.delete(chatId);
    await bot.sendMessage(chatId, '🔁 Cadastro reiniciado. Escolha uma opção:', mainMenu);
  }

  static async iniciar(chatId: number): Promise<void> {
    if (loggedInUsers.has(chatId)) {
      await bot.sendMessage(chatId, '⚠️ Você já está logado. Use /logout para sair.', mainMenu);
      return;
    }

    userSessions.set(chatId, {
      etapa: 1,
      lastActivity: Date.now(),
      comprovante_residencia_id: '',
      imagem_doc_id: ''
    });

    await bot.sendMessage(chatId, '👤 *Cadastro*\n\nDigite seu nome completo:', {
      parse_mode: 'Markdown',
      reply_markup: { remove_keyboard: true }
    });
  }

  static async processarDocumento(chatId: number, user: any, fileId: string): Promise<void> {
    if (user.etapa === 8) {
      user.imagem_doc_id = fileId;
      user.etapa = 9;
      await bot.sendMessage(chatId, '✅ *Documento recebido!*\n\nAgora envie o comprovante de residência:', {
        parse_mode: 'Markdown'
      });
    } else if (user.etapa === 9) {
      user.comprovante_residencia_id = fileId;
      user.etapa = 10;
      await bot.sendMessage(chatId, '✅ *Documentos recebidos!*\n\nCrie uma senha (mínimo 6 caracteres):', {
        parse_mode: 'Markdown'
      });
    }
  }

  static async processarEtapa(msg: TelegramBot.Message, user: any): Promise<void> {
    const chatId = msg.chat.id;
    const texto = msg.text?.trim() || '';

    // Permite reiniciar a qualquer momento
    if (/^(\/start|voltar|cancelar)$/i.test(texto)) {
      await this.reiniciarCadastro(chatId);
      return;
    }

    try {
      switch(user.etapa) {
        case 1: // Nome
          if (texto.length < 3) {
            await bot.sendMessage(chatId, '❌ Nome muito curto. Digite seu nome completo:', {
              reply_markup: { remove_keyboard: true }
            });
            return;
          }
          user.nome = texto;
          user.etapa = 2;
          await bot.sendMessage(chatId, '📧 Digite seu e-mail:', {
            reply_markup: { remove_keyboard: true }
          });
          break;

        case 2: // Email
          if (!Validacao.validarEmail(texto)) {
            await bot.sendMessage(chatId, '❌ E-mail inválido. Digite novamente:', {
              reply_markup: { remove_keyboard: true }
            });
            return;
          }
          user.email = texto;
          user.codigo = Math.floor(100000 + Math.random() * 900000).toString();
          await enviarCodigo(user.email, user.codigo);
          user.etapa = 3;
          await bot.sendMessage(chatId, '✉️ Código enviado. Digite o código recebido:', {
            reply_markup: { remove_keyboard: true }
          });
          break;

        case 3: // Código
          if (texto !== user.codigo) {
            await bot.sendMessage(chatId, '❌ Código incorreto. Tente novamente:', {
              reply_markup: { remove_keyboard: true }
            });
            return;
          }
          user.etapa = 4;
          await bot.sendMessage(chatId, '🔢 Digite seu CPF (apenas números, 11 dígitos):', {
            reply_markup: { remove_keyboard: true }
          });
          break;

        case 4: // CPF
          if (!Validacao.validarCPF(texto)) {
            await bot.sendMessage(chatId, '❌ CPF inválido. Digite 11 números:', {
              reply_markup: { remove_keyboard: true }
            });
            return;
          }
          user.cpf_cnpj = texto;
          user.etapa = 5;
          await bot.sendMessage(chatId, 'Deseja cadastrar CNPJ? (responda "sim" ou "não")', {
            reply_markup: { remove_keyboard: true }
          });
          break;

        case 5: // CNPJ opcional
          if (/^sim$/i.test(texto)) {
            user.etapa = 6;
            await bot.sendMessage(chatId, '🏢 Digite o CNPJ (14 dígitos):', {
              reply_markup: { remove_keyboard: true }
            });
          } else if (/^n[aã]o$/i.test(texto)) {
            user.etapa = 7;
            await bot.sendMessage(chatId, '🏠 Digite seu endereço completo:', {
              reply_markup: { remove_keyboard: true }
            });
          } else {
            await bot.sendMessage(chatId, 'Responda "sim" ou "não":', {
              reply_markup: { remove_keyboard: true }
            });
          }
          break;

        case 6: // CNPJ
          if (!Validacao.validarCNPJ(texto)) {
            await bot.sendMessage(chatId, '❌ CNPJ inválido. Digite 14 números:', {
              reply_markup: { remove_keyboard: true }
            });
            return;
          }
          user.cnpj = texto;
          user.etapa = 7;
          await bot.sendMessage(chatId, '🏠 Digite seu endereço (CPF):', {
            reply_markup: { remove_keyboard: true }
          });
          break;

        case 7: // Endereço CPF
          user.endereco_cpf = texto;
          if (user.cnpj) {
            user.etapa = 7.5;
            await bot.sendMessage(chatId, '🏢 Digite o endereço do CNPJ (ou "mesmo"):', {
              reply_markup: { remove_keyboard: true }
            });
          } else {
            user.endereco_cnpj = user.endereco_cpf;
            user.etapa = 8;
            await bot.sendMessage(chatId, '📷 Envie uma foto do seu documento (RG/CNH):', {
              parse_mode: 'Markdown'
            });
          }
          break;

        case 7.5: // Endereço CNPJ
          user.endereco_cnpj = texto.toLowerCase() === 'mesmo' ? user.endereco_cpf : texto;
          user.etapa = 8;
          await bot.sendMessage(chatId, '📷 Envie uma foto do seu documento (RG/CNH):', {
            parse_mode: 'Markdown'
          });
          break;

        case 8: // Aguardando documento
          await bot.sendMessage(chatId, '❌ Você precisa enviar uma foto do documento.');
          break;

        case 9: // Aguardando comprovante
          await bot.sendMessage(chatId, '❌ Você precisa enviar o comprovante.');
          break;

        case 10: // Senha
          if (!Validacao.validarSenha(texto)) {
            await bot.sendMessage(chatId, `❌ Senha muito curta (mínimo 6 caracteres):`);
            return;
          }
          
          try {
            user.senha = await bcrypt.hash(texto, 10);
            const usuario = {
              nome: user.nome,
              email: user.email,
              cpf_cnpj: user.cnpj ? `${user.cpf_cnpj}/${user.cnpj}` : user.cpf_cnpj,
              senha: user.senha,
              endereco_cpf: user.endereco_cpf,
              endereco_cnpj: user.endereco_cnpj,
              chat_id: chatId,
              imagem_doc_id: user.imagem_doc_id,
              comprovante_residencia_id: user.comprovante_residencia_id
            };

            await salvarUsuario(usuario);
            await bot.sendMessage(chatId, '🎉 *Cadastro concluído!*', {
              parse_mode: 'Markdown',
              reply_markup: mainMenu.reply_markup
            });

            if (ADMIN_CHAT_ID) {
              await bot.sendMessage(ADMIN_CHAT_ID, `📝 Novo cadastro:\nNome: ${usuario.nome}\nEmail: ${usuario.email}`);
            }

            userSessions.delete(chatId);
          } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            await bot.sendMessage(chatId, '❌ Erro ao cadastrar. Tente novamente.', mainMenu);
            userSessions.delete(chatId);
          }
          break;
      }
    } catch (error) {
      console.error('Erro no cadastro:', error);
      await bot.sendMessage(chatId, '❌ Ocorreu um erro. Use /cadastro para reiniciar.', mainMenu);
      userSessions.delete(chatId);
    }
  }
}