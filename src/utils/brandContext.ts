/**
 * Marca da requisição atual (white-label).
 * Quando a conta pertence a um escritório, a IA e os e-mails daquela requisição usam o nome
 * do escritório em vez de "Pequi". Funciona com AsyncLocalStorage: tudo o que roda a partir
 * da requisição (inclusive chamadas assíncronas) enxerga a mesma marca.
 */
import { AsyncLocalStorage } from 'async_hooks';

export type Brand = { name: string; slug?: string; panelUrl?: string };

const storage = new AsyncLocalStorage<Brand | null>();

export const runWithBrand = <T>(brand: Brand | null, fn: () => T): T => storage.run(brand, fn);

/** Marca do escritório da requisição atual, ou null quando é o próprio Pequi */
export const currentBrand = (): Brand | null => storage.getStore() || null;

/** Nome a exibir: o do escritório ou "Pequi" */
export const brandName = (brand?: Brand | null): string => (brand === undefined ? currentBrand() : brand)?.name || 'Pequi';
