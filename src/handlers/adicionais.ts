// src/handlers/adicionais.ts

import { bot } from '../bot';            // Certifique-se que o import não gera loop! Se der erro, passe o bot como parâmetro.
import { listarSites } from '../db';     // Função que retorna a lista de sites (do banco)

export const HandlersAdicionais = {
  // Exibe lista de sites para buscar editais
  listarSitesParaBusca: async (chatId: number) => {
    const sites = await listarSites();
    if (!sites || !sites.length) {
      await bot.sendMessage(chatId, 'Nenhum site cadastrado ainda.');
      return;
    }

    await bot.sendMessage(chatId, 'Escolha um site para busca:', {
      reply_markup: {
        inline_keyboard: sites.map(site => [
          { text: site.nome, callback_data: `buscar_${site.id}` }
        ])
      }
    });
  },

  // Você pode adicionar outros comandos aqui, por exemplo:
  mostrarSobre: async (chatId: number) => {
    await bot.sendMessage(chatId, 'Este é o Bot de Leilões, desenvolvido por Daniel.');
  },

  // ...outros comandos extras
};