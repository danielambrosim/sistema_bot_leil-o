// src/services/edital.ts
import axios from 'axios';
import cheerio from 'cheerio';

export interface Edital {
  titulo: string;
  link: string;
}

/**
 * Busca editais (PDFs) em uma URL usando um seletor CSS.
 * @param url URL do site de editais.
 * @param seletor Seletor CSS para encontrar os links dos editais. Default: 'a[href$=".pdf"]'
 * @param quantidade Máximo de editais a retornar.
 * @returns Array de editais { titulo, link }
 */
export async function buscarEditais(
  url: string,
  seletor = 'a[href$=".pdf"]',
  quantidade = 5
): Promise<Edital[]> {
  try {
    const { data } = await axios.get<string>(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (typeof data !== 'string') throw new Error('Resposta inesperada do servidor');

    const $ = cheerio.load(data);
    const editais: Edital[] = [];

    $(seletor).each((_, el) => {
      const href = $(el).attr('href');
      const texto = $(el).text().trim();

      // Valida se é edital por texto ou pega todos os PDFs se seletor custom
      if (href && (seletor !== 'a[href$=".pdf"]' || /edital|licita|concorr|preg[aã]o/i.test(texto))) {
        const linkCompleto = href.startsWith('http') ? href : new URL(href, url).href;
        editais.push({ titulo: texto || 'Edital', link: linkCompleto });
      }
    });

    return editais.slice(0, quantidade);
  } catch (err) {
    console.error(`[edital.ts] Erro ao buscar editais em ${url}:`, err);
    return [];
  }
}

/**
 * Formata um array de editais em uma mensagem pronta para o Telegram.
 * @param editais Lista de editais
 */
export function formatarEditaisParaMensagem(editais: Edital[]): string {
  if (!editais.length) return 'Nenhum edital encontrado.';
  return editais
    .map((edital, i) => `📄 *${edital.titulo}*\n[Baixar PDF](${edital.link})`)
    .join('\n\n');
}