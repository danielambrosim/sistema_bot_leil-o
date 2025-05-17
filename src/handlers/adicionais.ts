import { bot } from '../bot';
import { listarSites } from '../db';
import { buscarEditais } from '../services/edital';

export class HandlersAdicionais {
  // Lista todos os sites cadastrados no banco
  static async listarSitesParaBusca(chatId: number): Promise<void> {
    const sites = await listarSites();
    if (!sites.length) {
      await bot.sendMessage(chatId, 'Nenhum site cadastrado no sistema.');
      return;
    }
    const keyboard = sites.map(site => [{ text: site.nome }]);
    await bot.sendMessage(chatId, '🔍 Selecione um site:', {
      reply_markup: {
        keyboard,
        resize_keyboard: true
      }
    });
  }

  // Busca editais do site selecionado (por nome)
  static async buscarEditaisDoSite(siteNome: string): Promise<string[]> {
    const sites = await listarSites();
    const siteData = sites.find(s => s.nome === siteNome);
    if (!siteData) return [];
    return await buscarEditais(siteData.url, siteData.seletor);
  }
}
